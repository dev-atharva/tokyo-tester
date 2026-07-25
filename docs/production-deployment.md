# Production deployment runbook

This runbook deploys Tokyo Tester to one Linux server with Docker Compose. Caddy is the only public entry point. The UI, MCP adapter, runner, app databases, and Docker socket stay on the internal Compose network.

The supported production topology for this release is one dedicated Linux Docker host. Kubernetes execution and the former Docker-in-Docker deployment profile are deferred until the native in-cluster backend reaches Docker feature and recovery parity.

> Tokyo Tester's runner can create containers through the host Docker daemon. Treat the server and runner container as privileged infrastructure. Do not colocate unrelated, untrusted workloads on this host.

## 1. Prepare the server

Install Docker Engine with the Compose plugin, Git, GNU Make, and OpenSSL. Use a domain name with DNS control and provision enough CPU, memory, and disk for Tokyo Tester plus every service created by concurrent workflow runs.

Point the domain's `A` record, and `AAAA` record when used, to the server. Allow inbound TCP ports `80` and `443`, UDP `443` for HTTP/3, and a restricted SSH administration port. Do not expose ports `3000`, `8080`, `8090`, or the Docker socket.

Tokyo Tester needs a reachable Docker daemon before startup completes. `make prod` detects the host socket and writes `.env.docker-socket`; the runner then checks Docker again from inside the container before it starts the workflow worker or janitor. If the socket is missing, inaccessible, or mounted to the wrong path, the runner exits during startup and users cannot enqueue workflows into a broken runtime.

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
openssl rand -hex 24
openssl rand -base64 32
```

Put the generated values and public hostname in `.env`:

```dotenv
APP_ENV=production
LOG_LEVEL=info

AUTH_SECRET=<openssl-rand-hex-value>
AUTH_TRUST_HOST=true
AUTH_URL=https://tokyo.example.com

MYSQL_ROOT_PASSWORD=<first-openssl-rand-hex-value>
MYSQL_PASSWORD=<second-openssl-rand-hex-value>

TOKYO_TESTER_DOMAIN=tokyo.example.com
TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com
TOKYO_TESTER_PUBLIC_ORIGIN=https://tokyo.example.com
CORS_ORIGIN=https://tokyo.example.com

WORKFLOW_WORKER_ENABLED=true
WORKFLOW_JOB_ENCRYPTION_KEY=<openssl-rand-base64-value>
```

Keep the MySQL passwords, `AUTH_SECRET`, and `WORKFLOW_JOB_ENCRYPTION_KEY` in a protected password manager or secret store in addition to `.env`. Losing the workflow encryption key can make queued execution payloads unreadable. Changing these values is an intentional rotation procedure, not a routine deployment step.

The default deployment uses one persistent `mysql_data` volume with separate `tokyo_runner` and `tokyo_ui` schemas. MySQL is the supported app database for the durable workflow worker and the default for the UI. Workflow MySQL service nodes are separate from this app database setting.

For MySQL, the UI expects a normal MySQL URL such as `mysql://user:pass@host:3306/tokyo_ui`. The runner accepts either that URL shape or the Go MySQL DSN shape such as `user:pass@tcp(host:3306)/tokyo_runner`; it enables `parseTime=true` and `multiStatements=true` automatically.

## 3. Validate and deploy

```bash
make prod-check
make prod
make prod-verify
```

`make prod-check` validates required secrets, the Docker socket and daemon, Compose configuration, required host tools, and writable Docker volumes. `make prod` then builds the pinned source, applies runner and UI migrations, starts `runner`, `ui`, `mcp`, and `edge`, waits for health checks, and fails if a required service is unhealthy. `make prod-verify` checks private and public readiness, runs a Redis round-trip workflow, and fails if any managed container or network leaks. Do not reset either database during a normal deployment or upgrade.

There is one startup behavior change worth calling out for operators: Docker health is now a startup gate, not a first-workflow failure. If `runner` does not become healthy, check the detected socket in `.env.docker-socket`, the Compose socket mount, and the runner logs before retrying:

```bash
cat .env.docker-socket
docker compose --profile agent logs --tail=200 runner
docker info
```

Caddy obtains and renews the TLS certificate after DNS resolves and ports 80/443 reach the server.

## 4. First boot and verification

```bash
TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com make prod-verify
docker compose --profile agent logs --tail=200 runner ui mcp edge
curl -fsS https://tokyo.example.com/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

All four services should be healthy. The first external request can take a short time while Caddy obtains the certificate.

If `runner` is unhealthy and logs mention Docker reachability, fix Docker or the socket mount first. Restarting the UI or MCP adapter will not repair workflow execution because only the runner has Docker access.

Open `https://tokyo.example.com/setup` and create the initial platform administrator. After setup, use `/login`. Create Team workspaces and assign `owner`, `editor`, or `runner` roles according to least privilege.

## 5. Connect production coding agents

From the in-app **Docs** page, select the Personal or Team workspace and generate a project-scoped token. The token is shown only once.

Configure the coding agent with:

- Streamable HTTP URL: `https://tokyo.example.com/mcp`
- Header: `Authorization: Bearer <tt_pat_token>`

Effective scopes are checked against current workspace membership on every request, so a role downgrade immediately removes disallowed operations. Revoke a token with `DELETE /api/v1/agent/tokens/<token-id>` from its owning authenticated account.

Personal tokens are the current private-beta authentication path. Use this deployment with trusted users. OAuth 2.1 protected-resource discovery remains required before presenting the MCP endpoint as a broadly public integration.

## 6. Back up MySQL

Create a backup before every upgrade and on a regular schedule. The supported command uses `mysqldump --single-transaction` to export both application schemas into one file and writes its SHA-256 checksum:

```bash
make prod-backup
# Optional protected destination:
BACKUP_DIR=/mnt/encrypted/tokyo-backups make prod-backup
```

Store the dump and matching secret values encrypted, off the server. Regularly test restoration on a separate machine.

### Restore a backup

Restoration overwrites current data. Verify the dump checksum, matching secrets, and recorded Git revision first. Then:

```bash
export BACKUP_DIR=/path/to/verified-backup/timestamp
export BACKUP_COMMIT=recorded-git-commit
cd /opt/tokyo-tester
git checkout "$BACKUP_COMMIT"
install -m 600 /path/to/protected/production.env .env
(cd "$BACKUP_DIR" && sha256sum -c SHA256SUMS)

docker compose --profile agent down
docker compose up -d --wait mysql
docker compose exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root' \
  < "$BACKUP_DIR/tokyo-mysql.sql"

make prod
make prod-verify
```

Run the external health checks and a smoke workflow before allowing normal use. Restore into a separate server first whenever possible.

The MySQL transition does not delete legacy database volumes. If an existing deployment still contains data from an older database backend, stop before the first MySQL deployment and migrate a verified copy of that data; starting MySQL creates empty application schemas and does not convert legacy records automatically. `make prod-check` blocks the first MySQL deployment when it detects the former application volumes without a MySQL volume.

## 7. Upgrade safely

1. Run `make prod-capture` and store the redacted baseline securely.
2. Run `make prod-backup` and preserve the matching secrets.
3. Fetch and inspect the target release.
4. Run `make check` in CI or on a suitable build machine against the exact commit.
5. Check out the target release and run `make prod`.
6. Run `make prod-verify` and inspect migration/health logs before restoring normal concurrency.

```bash
git rev-parse HEAD
git fetch --tags
export TOKYO_TESTER_RELEASE=v1.2.3
git checkout "$TOKYO_TESTER_RELEASE"
make prod-check
make prod
TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com make prod-verify
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
