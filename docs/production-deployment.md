# Production deployment runbook

This runbook deploys Tokyo Tester to one Linux server with Docker Compose. Caddy is the only public entry point. The UI, MCP adapter, runner, and Docker socket stay on the internal Compose network; durable state lives in an externally managed MySQL server.

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
openssl rand -base64 32
```

Put the generated values and public hostname in `.env`:

```dotenv
APP_ENV=production
LOG_LEVEL=info

AUTH_SECRET=<openssl-rand-hex-value>
AUTH_TRUST_HOST=true
AUTH_URL=https://tokyo.example.com

RUNNER_DB_TYPE=mysql
UI_DB_TYPE=mysql
RUNNER_DATABASE_URL=mysql://tokyo:<encoded-password>@mysql.internal:3306/tokyo_runner
UI_DATABASE_URL=mysql://tokyo:<encoded-password>@mysql.internal:3306/tokyo_ui

TOKYO_TESTER_DOMAIN=tokyo.example.com
TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com
TOKYO_TESTER_PUBLIC_ORIGIN=https://tokyo.example.com
CORS_ORIGIN=https://tokyo.example.com

WORKFLOW_WORKER_ENABLED=true
WORKFLOW_JOB_ENCRYPTION_KEY=<openssl-rand-base64-value>

# Start conservatively and increase only after a load test on this host.
WORKFLOW_WORKER_CONCURRENCY=2
WORKFLOW_SCENARIO_CONCURRENCY=1
WORKFLOW_MAX_QUEUED_GLOBAL=100
WORKFLOW_MAX_QUEUED_PER_USER=3
WORKFLOW_MAX_QUEUED_PER_PROJECT=10
WORKFLOW_SUBMISSIONS_PER_MINUTE_USER=10
WORKFLOW_SUBMISSIONS_PER_MINUTE_PROJECT=60
WORKFLOW_MAX_RUNNING_PER_USER=1
WORKFLOW_MAX_RUNNING_PER_PROJECT=2

# Hard limits applied to every workflow-created container.
WORKFLOW_CONTAINER_MEMORY_MB=1024
WORKFLOW_CONTAINER_CPU_MILLI=1000
WORKFLOW_CONTAINER_PIDS=256

# Zero means no fixed test-execution deadline; cancellation remains available.
TEST_RUN_TIMEOUT_SEC=0
```

Keep the MySQL credentials, `AUTH_SECRET`, and `WORKFLOW_JOB_ENCRYPTION_KEY` in a protected password manager or secret store in addition to `.env`. Losing the workflow encryption key can make queued execution payloads unreadable. Changing these values is an intentional rotation procedure, not a routine deployment step.

Production requires externally managed MySQL with separate `tokyo_runner` and `tokyo_ui` databases. The application server must be allowed to reach MySQL, while port `3306` remains restricted from the public internet. The application credentials need enough authority to apply forward migrations. Workflow MySQL service nodes are separate from this application database setting.

Workflow submissions are admitted transactionally. Duplicate submissions with the same run ID remain idempotent, while durable per-user and per-project rate limits and queue limits return `429` with `Retry-After`; the global queue cap returns `503`. Pending work is scheduled FIFO within priority while reserving running capacity across users and projects. The UI displays approximate queue position and historical p50/p90 duration ranges once enough completed-run history exists. Workflow and scenario leases are renewed independently of the browser connection, so closing the page does not stop a run.

Every workflow-created container receives runner-owned CPU, memory, swap, and PID cgroup limits. Workflow payloads cannot override them. Tune the defaults only after observing real service requirements and host headroom; the aggregate worst case is the per-container limit multiplied by the maximum services across every concurrently running scenario.

Workflow progress is stored in an append-only event journal. Workflow and scenario rows retain only a bounded recent tail; older logs remain available through cursor pagination in the execution drawer. Cancellation is durable: pending jobs stop immediately, while running jobs transition through cleanup before becoming `cancelled`.

Both production database variables use normal, URL-encoded MySQL URLs such as `mysql://user:pass@host:3306/tokyo_ui`. The runner enables `parseTime=true` and `multiStatements=true` automatically.

## 3. Validate and deploy

```bash
make prod-observe-user
make prod-check
make prod
make prod-verify
```

`make prod-observe-user` interactively creates the separate bcrypt-protected log administrator in `.secrets/dozzle-users.yml`. `make prod-check` refuses to deploy when that file is missing or contains a non-bcrypt password. It also validates the external database URLs, required secrets, Docker socket and daemon, Compose configuration, required host tools, and writable Docker volumes. `make prod` then builds the pinned source, applies runner and UI migrations to external MySQL, starts `runner`, `ui`, `mcp`, `edge`, and the authenticated observability UI, waits for health checks, and fails if a required service is unhealthy. `make prod-verify` checks private and public readiness, runs a Redis round-trip workflow, and fails if any managed container or network leaks. Do not reset either database during a normal deployment or upgrade.

There is one startup behavior change worth calling out for operators: Docker health is now a startup gate, not a first-workflow failure. If `runner` does not become healthy, check the detected socket in `.env.docker-socket`, the Compose socket mount, and the runner logs before retrying:

```bash
cat .env.docker-socket
docker compose --profile agent logs --tail=200 runner
docker info
```

Caddy obtains and renews the TLS certificate after DNS resolves and ports 80/443 reach the server.

For a temporary deployment restricted to a trusted network or source IP, HTTP can be enabled explicitly. This sends credentials, session cookies, and MCP tokens without transport encryption and must not be treated as an internet-facing production configuration. Use the same origin everywhere so Caddy serves HTTP and Auth.js emits compatible cookies:

```dotenv
ALLOW_INSECURE_HTTP=true
TOKYO_TESTER_DOMAIN=http://192.0.2.10
TOKYO_TESTER_PUBLIC_URL=http://192.0.2.10
TOKYO_TESTER_PUBLIC_ORIGIN=http://192.0.2.10
AUTH_URL=http://192.0.2.10
CORS_ORIGIN=http://192.0.2.10
MCP_PUBLIC_URL=http://192.0.2.10/mcp
```

Replace the example address with the server address and visit it with `http://`, not `https://`. Keep `ALLOW_INSECURE_HTTP` unset or `false` for normal deployments.

## 4. First boot and verification

```bash
MCP_PROD_VERIFY_TOKEN=<temporary-read-token> \
  TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com make prod-verify
docker compose --profile agent logs --tail=200 runner ui mcp edge
curl -fsS https://tokyo.example.com/mcp \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"ping"}'
```

All five services should be healthy. The first external request can take a short time while Caddy obtains the certificate.

The live log UI is routed by Caddy beneath the application origin. Print the configured address:

```bash
make prod-observe
```

Open `<TOKYO_TESTER_PUBLIC_ORIGIN>/logs/` and use the log-administrator credentials created before deployment. The log login is intentionally separate from Tokyo Tester project accounts because the viewer can read host-wide Docker logs and much of the Docker API. Actions, shell access, and analytics are disabled, and the container is bounded to 128 MB of memory and 0.25 CPU by default.

Do not expose this path to the public internet over plain HTTP. HTTP leaves the administrator password, session, and log contents unencrypted. For the temporary beta, restrict the application address to the company network or an approved internal reverse proxy; add TLS before broadening access.

Compose services use Docker's rotating `local` logging driver with three 10 MB segments per service by default. Adjust `CONTAINER_LOG_MAX_SIZE`, `CONTAINER_LOG_MAX_FILES`, `DOZZLE_MEMORY_LIMIT`, and `DOZZLE_CPU_LIMIT` only after measuring host capacity.

If `runner` is unhealthy and logs mention Docker reachability, fix Docker or the socket mount first. Restarting the UI or MCP adapter will not repair workflow execution because only the runner has Docker access.

Open `https://tokyo.example.com/setup` and create the initial platform administrator. After setup, use `/login`. Create Team workspaces and assign `owner`, `editor`, or `runner` roles according to least privilege.

### Pull images from a custom registry

In Expert mode, open a service, select **Registry**, and enable the custom registry option. Enter only the registry host and optional port, such as `ghcr.io` or `registry.example.com:5000`. Do not enter `https://` and do not put a repository path in this field.

The service image field contains the repository path, tag, or digest. Nested paths are supported and are appended without modification:

```text
Registry host: registry.example.com:5000
Service image: team/platform/payments/api:v1
Pulled image:  registry.example.com:5000/team/platform/payments/api:v1
```

An already-qualified image is also accepted when its host matches the configured registry. A host mismatch fails validation and the runner never falls back to Docker Hub.

For most registries, select **Username and password / pull token**. Put the robot/user name in the username field and a short-lived, read-only registry token in the password field. GitHub and GitLab personal access tokens are passwords for Docker basic authentication; the advanced identity-token option is only for a token returned by a Docker registry authorization service.

The registry host and authentication method are saved with the workflow. Passwords and tokens are not persisted in browser storage or workflow exports: they remain in browser memory, are submitted only for services in the active workflow, and must be re-entered after a page reload. The queued job payload is protected by the runner's workflow encryption key and its ciphertext is cleared after the terminal job transition.

Use a TLS-enabled registry with a certificate trusted by the Docker host. Configuring Docker daemon `insecure-registries` is an operator-level host change and is not performed by Tokyo Tester.

## 5. Connect production coding agents

Open **Docs → Agent setup** and select the Personal or Team workspace. The page shows the correct Streamable HTTP URL and provides the packaged `tokyo-tester` skill.

For an internet-facing deployment, use `MCP_AUTH_MODE=oauth`. Configure the issuer, RFC 7662 introspection endpoint, and confidential client credentials from `.env.example`. The authorization server must:

- expose its standard OAuth authorization-server metadata;
- use TLS and issue an access token containing `sub`, `email`, scopes, and an audience;
- issue the exact per-project MCP URL as the token audience, such as `https://tokyo.example.com/mcp/projects/<project-id>`;
- support the `read`, `workflow:write`, and `run` scopes.

Tokyo Tester exposes RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp/projects/<project-id>`. The MCP server introspects the access token and replaces it with a signed, 60-second internal assertion before calling UI APIs. The client token is never forwarded.

For a controlled self-hosted deployment with trusted users, `MCP_AUTH_MODE=personal_token` remains supported. Generate the project token in Agent setup, store the one-time value in the MCP client's secret storage, and revoke it from the same page when it is no longer needed. Effective scopes are checked against current workspace membership on every request.

Run `make prod-verify` after setup with a temporary read-only credential in `MCP_PROD_VERIFY_TOKEN`, then revoke it. OAuth mode also requires `MCP_VERIFY_PROJECT_ID` for an audience-bound read check. Verification never writes directly to the external database.

## 6. Back up MySQL

Create a backup before every upgrade and on a regular schedule. Prefer provider snapshots when available. The supported command runs a disposable MySQL client, uses `mysqldump --single-transaction` against the external server, exports both application databases, and writes a SHA-256 checksum. Configure a dedicated backup account:

```dotenv
MYSQL_BACKUP_HOST=mysql.internal
MYSQL_BACKUP_PORT=3306
MYSQL_BACKUP_USER=tokyo_backup
MYSQL_BACKUP_PASSWORD=<backup-password>
MYSQL_BACKUP_SSL_MODE=REQUIRED
```

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

docker compose --profile agent --profile observability down
MYSQL_PWD="$MYSQL_BACKUP_PASSWORD" docker run --rm -i \
  --env MYSQL_PWD \
  mysql:8.4 mysql \
  --host="$MYSQL_BACKUP_HOST" \
  --port="${MYSQL_BACKUP_PORT:-3306}" \
  --user="$MYSQL_BACKUP_USER" \
  --ssl-mode="${MYSQL_BACKUP_SSL_MODE:-REQUIRED}" \
  < "$BACKUP_DIR/tokyo-mysql.sql"

make prod
MCP_PROD_VERIFY_TOKEN=<temporary-read-token> make prod-verify
```

Run the external health checks and a smoke workflow before allowing normal use. Restore into a separate database server first whenever possible and follow provider-specific recovery guidance when it is stricter than this generic client procedure.

## 7. Upgrade safely

1. Run `make prod-capture` and store the redacted baseline securely.
2. Run `make prod-backup` and preserve the matching secrets.
3. Fetch and inspect the target release.
4. Run `make check` in CI or on a suitable build machine against the exact commit.
5. Check out the target release and run `make prod`.
6. Run `make prod-verify` and inspect migration/health logs before restoring normal concurrency.

Before promoting a beta release, run the renewable-lease soak gate and the repeated Docker cleanup journey on the candidate host:

```bash
TOKYO_SOAK_DURATION=24h make test-soak
make e2e-docker-leak
```

The soak test fails if a long-running session ever loses its renewable lease. The repeated journey fails on workflow errors or leaked managed containers and networks.

```bash
git rev-parse HEAD
git fetch --tags
export TOKYO_TESTER_RELEASE=v1.2.3
git checkout "$TOKYO_TESTER_RELEASE"
make prod-check
make prod
MCP_PROD_VERIFY_TOKEN=<temporary-read-token> \
  TOKYO_TESTER_PUBLIC_URL=https://tokyo.example.com make prod-verify
docker compose --profile agent logs -f --tail=200 runner ui mcp edge
```

Database migrations are forward-moving. If a release must be rolled back after migrations, restore the pre-upgrade database backup together with the previous code and secrets. Merely checking out older code may be unsafe.

## 8. Operations and incidents

```bash
# Current state
docker compose --profile agent --profile observability ps

# Follow service logs
docker compose --profile agent logs -f --tail=200 runner ui mcp edge

# Restart one adapter without touching databases
docker compose --profile agent restart mcp

# Rebuild one stale image
docker compose --profile agent build --no-cache ui
docker compose --profile agent up -d ui

# Stop while preserving all volumes
docker compose --profile agent --profile observability down
```

Monitor host disk, memory, Docker container count, workflow queue activity in logs, and certificate renewal. Set conservative workflow and scenario concurrency for the server's capacity. Never run `make reset` in production: it removes persistent database volumes.
