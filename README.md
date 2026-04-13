# Tokyo Tester

Tokyo Tester is a local-first end-to-end testing platform for service graphs and their infra dependencies.

It lets you define workflows in the UI, runs them through a Go-based runner, and syncs workflows, executions, and test results back into the app.

If you want the higher-level architecture walkthrough, see [How the system works](./docs/system-overview.md).

## Preview

![Tokyo Tester demo](./Tokyo-tester-demo.gif)

> The preview area is intentionally kept near the top so you can swap in a screenshot, a different recording, or an architecture image later without reshaping the README.

## Try The Sample Workflow

If you want to understand the product quickly, import [`test-workflow.json`](./test-workflow.json) into the UI.

Before importing it, build the sample API image the workflow expects:

```bash
docker build -t bun-user-api:latest ./test-api
```

In the workflow list, use **Import Workflow**, then select the file. It gives you a ready-made example with:

- a service graph
- a PostgreSQL dependency
- HTTP and database tests
- scenarios that show how runs are organized

## What It Does

- Build workflow graphs in the UI
- Provision services and dependencies through the runner
- Execute tests against the running stack
- Track workflow runs, logs, and results
- Sync state between the UI and backend

## How It Works

- `ui-v2` is the Next.js app for editing workflows, scenarios, and executions
- `runner-v2` is the Go service that provisions containers, runs tests, and cleans up
- `docker-compose.yml` wires the UI, runner, Postgres, and Inngest together for local development
- Sync endpoints keep local UI changes and backend data in step

## Getting Started

The easiest way to run everything locally is with Docker:

```bash
make dev
```

That starts the dev stack with the UI, runner, and supporting services.

Useful commands:

```bash
make prod
make down
```

If you want to run pieces manually, the main environment values live in [`.env.example`](./.env.example).

Common ports:

- UI: `http://localhost:3000`
- Runner API: `http://localhost:8080`
- Inngest dev server: `http://localhost:8288`

## Built With

- Next.js
- React
- Zustand
- Inngest
- Go
- Chi
- Docker
- testcontainers-go

## Notes

- The project is still local/self-hosted by default.
- A deployed demo is not required to explore the code or understand the workflow.
