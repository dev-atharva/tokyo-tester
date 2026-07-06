# Development setup with a coding agent

This is the canonical setup for running Tokyo Tester on a development machine and using a coding agent against repositories on that same machine.

For an internet-facing single-server installation, use the [Production deployment runbook](./production-deployment.md).

## 1. Install prerequisites

Install:

- Git
- Docker Engine or Docker Desktop with Docker Compose
- GNU Make
- Go, only when `make doctor` says the detected Docker socket requires the host-runner fallback

Give Docker enough memory for the services your workflows will provision. The larger sample workflow can use 4–6 GB.

## 2. Start Tokyo Tester

```bash
git clone https://github.com/your-org/tokyo-tester.git
cd tokyo-tester
make dev
```

`make dev` performs the environment checks, detects the Docker socket, builds the development services, and applies both databases' pending migrations. Do not reset either database for a normal upgrade.

Open [http://localhost:3000/setup](http://localhost:3000/setup) on the first boot. Later boots use [http://localhost:3000/login](http://localhost:3000/login).

Start the local MCP adapter in a second terminal:

```bash
make agent-dev
curl http://localhost:8090/health
```

The development MCP endpoint is `http://localhost:8090/mcp`. The runner API and its Docker socket remain private.

## 3. Create a project-scoped agent token

The easiest route is the in-app **Docs** page. Select the Personal or Team workspace the agent should use, then generate a token. The token is displayed only once.

For the private-beta API directly, send an authenticated request from the signed-in browser session:

```js
await fetch("/api/v1/agent/tokens", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: "Development coding agent",
    projectId: "<active-workspace-id>",
    scopes: ["read", "workflow:write", "run"],
    expiresInDays: 30,
  }),
}).then((response) => response.json())
```

Requested scopes are restricted by the current workspace role. A runner receives `read` and `run`, while an editor or owner can also receive `workflow:write`.

## 4. Connect the coding agent

Add a Streamable HTTP MCP server to the coding agent:

- URL: `http://localhost:8090/mcp`
- Header: `Authorization: Bearer <tt_pat_token>`

Install the Tokyo Tester skill where the agent can discover workspace skills:

```bash
mkdir -p ~/agent-workspace/.agents/skills
cp -R /path/to/tokyo-tester/.agents/skills/tokyo-tester ~/agent-workspace/.agents/skills/
```

Use the equivalent user-level skill directory when your agent does not discover `.agents/skills` from the workspace.

## 5. Test with several repositories

This is a practical integration test:

```text
agent-workspace/
├── .agents/skills/tokyo-tester/
└── repositories/
    ├── api/
    ├── worker/
    ├── web/
    ├── payments/
    └── infrastructure/
```

Start the coding agent from `agent-workspace` and grant it read access to those repositories. The agent inspects the files locally; Tokyo Tester MCP never reads the machine's filesystem.

A useful first prompt is:

> Inspect the repositories in this workspace and use the Tokyo Tester skill. Propose a small smoke workflow, validate it through MCP, show me the scenarios, and ask for approval before importing or running anything.

Confirm that the agent can:

1. list the authorized workspace and its permissions;
2. discover Compose files, Dockerfiles, services, ports, health checks, APIs, migrations, and existing tests locally;
3. validate a workflow through MCP;
4. import it only after approval;
5. run selected scenarios, poll the run, and retrieve diagnostics;
6. report the immutable workflow revision attached to the run.

## Daily commands

```bash
make doctor     # inspect prerequisites and ports
make dev        # start UI + runner and apply migrations
make agent-dev  # expose development MCP on port 8090
make check      # run backend, frontend, and Compose checks
make down       # stop services and preserve databases
make reset      # stop services and delete local database volumes
```

Use `make reset` only when you intentionally want a clean environment. Pending migrations are applied automatically during normal startup.
