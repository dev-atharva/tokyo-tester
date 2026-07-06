# Production deployment runbook

This runbook deploys Tokyo Tester to one Linux server with Docker Compose. Caddy is the only public entry point. The UI, MCP adapter, runner, SQLite databases, and Docker socket stay on the internal Compose network.

> Tokyo Tester's runner can create containers through the host Docker daemon. Treat the server and runner container as privileged infrastructure. Do not colocate unrelated, untrusted workloads on this host.

## 1. Prepare the server

Install Docker Engine with the Compose plugin, Git, GNU Make, and OpenSSL. Use a domain name with DNS control and provision enough CPU, memory, and disk for Tokyo Tester plus every service created by concurrent workflow runs.

Point the domain's `A` record, and `AAAA` record when used, to the server. Allow inbound TCP ports `80` and `443`, UDP `443` for HTTP/3, and a restricted SSH administration port. Do not expose ports `3000`, `8080`, `8090`, or the Docker socket.

Deploy a pinned release or reviewed commit rather than an unknown moving branch:

```bash
git clone https://github.com/your-org/tokyo-tester.git
cd tokyo-tester
export TOKYO_TESTER_RELEASE=v1.2.3
git checkout "$TOKYO_TESTER_RELEASE"
```

## 2. Configure production secrets

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -base64 32
```

Put the generated values and public hostname in `.env`:

```dotenv
APP_ENV=production
LOG_LEVEL=info

AUTH_SECRET=<openssl-rand-hex-value>
AUTH_TRUST_HOST=true
AUTH_URL=https://tokyo.example.com

TOKYO_TESTER_DOMAIN=tokyo.example.com
TOKYO_TESTER_PUBLIC_ORIGIN=https://tokyo.example.com
CORS_ORIGIN=https://tokyo.example.com

WORKFLOW_WORKER_ENABLED=true
WORKFLOW_JOB_ENCRYPTION_KEY=<openssl-rand-base64-value>
```

Keep `AUTH_SECRET` and `WORKFLOW_JOB_ENCRYPTION_KEY` in a protected password manager or secret store in addition to `.env`. Losing the workflow encryption key can make queued execution payloads unreadable. Changing either secret is an intentional rotation procedure, not a routine deployment step.

The default deployment uses `runner_data` for workflows, revisions, executions, and results, and `ui_data` for authentication, projects, memberships, and agent tokens. PostgreSQL can be selected separately with `RUNNER_DB_TYPE`, `RUNNER_DATABASE_URL`, `UI_DB_TYPE`, and `UI_DATABASE_URL`.

## 3. Validate and deploy

```bash
make compose-check
make prod
```

`make prod` detects the Docker socket, builds the pinned source, and starts `runner`, `ui`, `mcp`, and `edge`. The runner starts with `-migrate`; the UI runs `db:migrate` before starting. Pending migrations are applied automatically. Do not reset either database during a normal deployment or upgrade.

Caddy obtains and renews the TLS certificate after DNS resolves and ports 80/443 reach the server.

## 4. First boot and verification

```bash
docker compose --profile agent ps
docker compose --profile agent logs --tail=200 runner ui mcp edge
curl -fsS https://tokyo.example.com/api/health
curl -fsS https://tokyo.example.com/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

All four services should be healthy. The first external request can take a short time while Caddy obtains the certificate.

Open `https://tokyo.example.com/setup` and create the initial platform administrator. After setup, use `/login`. Create Team workspaces and assign `owner`, `editor`, or `runner` roles according to least privilege.

## 5. Connect production coding agents

From the in-app **Docs** page, select the Personal or Team workspace and generate a project-scoped token. The token is shown only once.

Configure the coding agent with:

- Streamable HTTP URL: `https://tokyo.example.com/mcp`
- Header: `Authorization: Bearer <tt_pat_token>`

Effective scopes are checked against current workspace membership on every request, so a role downgrade immediately removes disallowed operations. Revoke a token with `DELETE /api/v1/agent/tokens/<token-id>` from its owning authenticated account.

Personal tokens are the current private-beta authentication path. Use this deployment with trusted users. OAuth 2.1 protected-resource discovery remains required before presenting the MCP endpoint as a broadly public integration.

## 6. Back up SQLite deployments

Create a backup before every upgrade and on a regular schedule. For a consistent SQLite copy, briefly stop writers, archive both mounted data directories, then restart:

```bash
mkdir -p backups/$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_DIR=$(ls -dt backups/* | head -1)

docker compose --profile agent stop mcp ui runner

docker compose --profile agent run -T --rm --no-deps \
  --entrypoint sh runner -c 'tar -C /app/data -czf - .' \
  > "$BACKUP_DIR/runner-data.tgz"

docker compose --profile agent run -T --rm --no-deps \
  --entrypoint sh ui -c 'tar -C /app/data -czf - .' \
  > "$BACKUP_DIR/ui-data.tgz"

docker compose --profile agent up -d
sha256sum "$BACKUP_DIR"/*.tgz > "$BACKUP_DIR/SHA256SUMS"
```

Store the archives and matching secret values encrypted, off the server. Regularly test restoration on a separate machine. With PostgreSQL, use the provider's snapshot or `pg_dump`/`pg_restore` procedure instead of copying container files.

### Restore a backup

Restoration overwrites current data. Verify that the backup contains both archives, its checksums, the matching secrets, and the Git revision that created it. Then:

```bash
export BACKUP_DIR=/path/to/verified-backup
export BACKUP_COMMIT=recorded-git-commit
cd /opt/tokyo-tester
git checkout "$BACKUP_COMMIT"
install -m 600 /path/to/protected/production.env .env
(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)

docker compose --profile agent down

docker compose --profile agent run -T --rm --no-deps \
  --entrypoint sh runner -c \
  'find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf - -C /app/data' \
  < "$BACKUP_DIR/runner-data.tgz"

docker compose --profile agent run -T --rm --no-deps \
  --entrypoint sh ui -c \
  'find /app/data -mindepth 1 -maxdepth 1 -exec rm -rf {} +; tar -xzf - -C /app/data' \
  < "$BACKUP_DIR/ui-data.tgz"

make prod
```

Run the external health checks and a smoke workflow before allowing normal use. Restore into a separate server first whenever possible.

## 7. Upgrade safely

1. Record the deployed Git commit.
2. Back up both databases and secrets.
3. Fetch and inspect the target release.
4. Run `make check` in CI or on a suitable build machine against the exact commit.
5. Check out the target release and run `make prod`.
6. Watch migrations and health logs, then run the external health checks.
7. Run a small smoke workflow before restoring normal concurrency.

```bash
git rev-parse HEAD
git fetch --tags
export TOKYO_TESTER_RELEASE=v1.2.3
git checkout "$TOKYO_TESTER_RELEASE"
make compose-check
make prod
docker compose --profile agent logs -f --tail=200 runner ui mcp edge
```

Database migrations are forward-moving. If a release must be rolled back after migrations, restore the pre-upgrade database backup together with the previous code and secrets. Merely checking out older code may be unsafe.

## 8. Operations and incidents

```bash
# Current state
docker compose --profile agent ps

# Follow service logs
docker compose --profile agent logs -f --tail=200 runner ui mcp edge

# Restart one adapter without touching databases
docker compose --profile agent restart mcp

# Rebuild one stale image
docker compose --profile agent build --no-cache ui
docker compose --profile agent up -d ui

# Stop while preserving all volumes
docker compose --profile agent down
```

Monitor host disk, memory, Docker container count, workflow queue activity in logs, and certificate renewal. Set conservative workflow and scenario concurrency for the server's capacity. Never run `make reset` in production: it removes persistent database volumes.
