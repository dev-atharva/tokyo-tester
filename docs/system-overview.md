# Tokyo Tester System Overview

Tokyo Tester is built around a simple idea: a workflow is a graph of services, and each scenario is a set of tests that runs against that graph.

This page walks through the main path through the app, from drawing the workflow to running it and syncing the results back to the database.

## Building a workflow

The UI is where a workflow starts to take shape.

- The builder uses React Flow for the canvas.
- Service nodes are added from the drawer and configured in the node forms.
- A workflow ends up as:
  - `nodes` and `edges` for the service graph
  - one or more `scenarios`
  - ordered tests inside each scenario

You are not editing backend structs directly. You are drawing a graph, and the app turns that graph into the internal workflow bundle format behind the scenes.

[`test-workflow.json`](../test-workflow.json) is a good place to look if you want to see the shape without clicking around first.

## Turning the graph into something runnable

Before a run starts, the UI checks the graph and translates it into executable data.

- `validateWorkflowGraph` makes sure the graph is sane and that generic services have an image.
- `translateWorkflowGraphToServiceGraph` turns the visual graph into a service dependency graph.
- `validateScenario` checks that scenarios target real services and that test dependencies line up.
- `translateScenarioToExecutionBundle` trims the workflow down to just the services and tests needed for one scenario.

That translation happens in the UI before the run starts, and again in the runner when a workflow bundle is executed.

## What happens when you click run

When the user starts execution, the UI creates a workflow run id, prepares scenario run ids, updates local state, flushes pending workflow changes, and submits the run to `POST /api/v1/workflow-runs`.

The runner's embedded SQLite worker then takes over:

- it validates the workflow again
- it translates the graph into a service graph
- it runs scenarios with controlled concurrency
- it persists workflow, scenario, and test checkpoints directly
- it streams logs and test results through replayable SSE events
- it returns a summary for the overall workflow run

That split matters in production. Realtime events are the fast path for a responsive UI, but the database is the durable source of truth for workflow progress, logs, scenario runs, and final results.

## How a scenario runs

Each scenario is handled on its own, so the UI can show progress and failures clearly.

For every scenario, the worker:

- validates the scenario against the translated service graph
- converts it into an execution bundle with only the services and tests it needs
- provisions the required services
- emits running and terminal workflow events
- executes tests in order and persists checkpoints
- publishes the final pass/fail results
- cleans up the backend session when the scenario ends

That makes each scenario feel like a small, self-contained run instead of one giant opaque job.

## Who owns which state

Not every record in the system is authored by the same side.

- workflow definitions, graph nodes, edges, and scenarios are edited in the UI first
- workflow runs, scenario runs, and test results become execution-owned once a run starts
- Zustand still keeps local state so the UI stays responsive, but execution records are reconciled from the backend instead of being treated as browser-authored truth

That ownership split is what prevents production runs from drifting when realtime delivery is delayed, a tab is backgrounded, or the browser reconnects after missing events.

## What the runner does

The Go runner is responsible for container lifecycle and test execution.

### Provisioning services

The `/services` endpoint starts the services for a scenario.

- A shared Docker network is created for the run.
- Services are sorted by dependency level before provisioning.
- Each service provider handles its own container setup.
- Environment values are interpolated right before provisioning so services can reference each other.
- If something fails, the runner collects logs to make the failure easier to understand.

### Running tests

The `/tests/{sessionID}` endpoint runs the tests against those services.

The runner knows how to execute a handful of test types:

- `http`
- `database`
- `document`
- `shell`
- `cache`
- `queue`
- `delay`

Tests run in dependency order, and failures include container logs when the executor can provide them.

### Cleaning up

The `/cleanup/{sessionID}` endpoint tears everything down after the scenario finishes.

- containers are terminated
- the Docker network is removed
- the session is closed

## How sync keeps up with the UI

The UI keeps local state in Zustand stores, and those stores are persisted to IndexedDB.

On top of that, a small sync layer watches for changes and turns them into queued operations.

- store mutations are tracked as `insert`, `update`, or `delete`
- changes are queued and persisted in `localStorage`
- `SyncService` flushes batches to the backend every few seconds
- the queue is restored on startup and flushed before server hydration runs
- the app also attempts an immediate flush when the page is hidden or closed, using `sendBeacon` when available
- the batch endpoint is `POST /api/v1/sync/batch`
- the backend uses a transaction to upsert workflows, scenarios, workflow runs, sessions, and test results
- if the server already has a newer version, it records a conflict instead of overwriting it blindly

That gives the app a local-first feel while still keeping the database in sync with what the user is doing in the browser.

The backend also exposes a pull path so the UI can hydrate from server state on first load:

- `GET /api/v1/sync/pull/{clientId}`

During hydration, the frontend now protects newer workflow and scenario versions from being overwritten by older payloads from the server. That is especially important when a user edits locally, background sync lags for a moment, and then the app rehydrates.

## Realtime in production

In development, the app can feel like realtime alone is enough because everything is close together and long-lived.

In a production build, a few things make that less reliable:

- browser tabs can be suspended or closed at any point
- websocket or SSE delivery can reconnect after gaps
- a standalone Next.js build can render and hydrate on a different cadence than the dev server

Because of that, Tokyo Tester treats realtime as an accelerator, not the only delivery path. Workflow logs and execution progress are persisted, SSE reconnects replay missed events with `Last-Event-ID`, and snapshots reconcile the UI after longer gaps.

## Runtime notes

- the UI production image runs the app with Bun, but database migration uses a small Node entrypoint because `better-sqlite3` is not supported by Bun
- DB-backed routes are forced to render dynamically in the production build so auth and workflow pages are not incorrectly treated as static at build time

## A good first workflow to try

If you want to see the whole system working together, import [`test-workflow.json`](../test-workflow.json) into the UI.

That sample shows:

- a service graph with a backend API and PostgreSQL
- an HTTP scenario
- a database assertion scenario
- a workflow bundle that can be translated and executed end to end

Before importing it, build the sample API image the bundle expects:

```bash
docker build -t bun-user-api:latest ./test-api
```

## The short version

If you want the 10-second explanation:

- the UI is where you draw the workflow
- the translator turns the graph into executable services and tests
- the runner's durable worker coordinates the run
- the runner provisions containers and executes the tests
- sync keeps workflow definitions aligned with what changed locally
- persisted execution state lets the UI recover when realtime updates are missed

That split is what makes the app good for both interactive editing and repeatable execution.
