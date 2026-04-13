# Tokyo Tester System Overview

Tokyo Tester is built around one idea: a workflow is a graph of services, and each scenario is a set of tests that runs against that graph.

This document explains the main flow at a high level, from building the graph in the UI to syncing data, starting a run, provisioning services, and recording results.

## 1. Building Workflows In The UI

The UI is the place where a user creates the workflow definition.

- The workflow builder uses React Flow for the canvas and node editing.
- Service nodes are added from the drawer and configured through the node config forms.
- A workflow is stored as:
  - `nodes` and `edges` for the service graph
  - one or more `scenarios`
  - each scenario containing ordered test definitions

In practice, the user is not editing raw backend objects. They are working with a visual graph, and the app turns that graph into the internal workflow bundle format.

The sample bundle in [`test-workflow.json`](../test-workflow.json) is a good example of this shape.

## 2. From Graph To Executable Data

Before execution, the app validates the graph and translates it into a service graph.

- `validateWorkflowGraph` checks that nodes are connected sensibly and that generic services have an image.
- `translateWorkflowGraphToServiceGraph` turns the visual graph into a service dependency graph.
- `validateScenario` checks that each scenario targets real services and that test dependencies are valid.
- `translateScenarioToExecutionBundle` narrows the workflow down to the services and tests needed for one scenario.

This translation happens in the UI before a run starts, and again in the backend runner when a workflow bundle is executed.

## 3. Starting A Run With Inngest

When the user starts execution, the UI creates a workflow run id, prepares scenario run ids, updates local execution state, and sends an Inngest event:

- event name: `cots/workflow.run.start`
- payload: workflow ids, graph nodes, edges, scenarios, and registry secrets

The Inngest function `cotsWorkFlow` receives that event and orchestrates the full run:

- validate the workflow graph again
- translate the graph into a service graph
- execute scenarios with controlled concurrency
- stream workflow logs and test result events through realtime channels
- summarize the final result for the workflow run

## 4. How Each Scenario Runs

Each scenario is executed as a separate unit of work.

For every scenario, the runtime:

- validates the scenario against the translated service graph
- translates the scenario into an execution bundle containing only the required services and tests
- calls the runner to provision services
- emits pending and running test result events
- calls the runner again to execute the tests
- publishes final pass/fail test results
- cleans up the backend session when the scenario ends

The scenario lifecycle is intentionally explicit so the UI can show progress, logs, and results as they happen.

## 5. What The Runner Does

The Go runner owns the container lifecycle and the actual test execution.

### Service provisioning

The `/services` endpoint provisions the scenario services.

- A shared Docker network is created for the run.
- Services are sorted by dependency level before provisioning.
- Each service provider handles its own container setup.
- Environment values are interpolated right before provisioning so services can reference each other.
- If a service fails, the runner collects logs to help explain the failure.

### Test execution

The `/tests/{sessionID}` endpoint runs tests against the provisioned services.

The runner registers multiple executor types:

- `http`
- `database`
- `document`
- `shell`
- `cache`
- `queue`
- `delay`

Tests are also run in dependency order, and failures include container logs where possible.

### Cleanup

The `/cleanup/{sessionID}` endpoint tears everything down after a scenario finishes.

- containers are terminated
- the Docker network is removed
- the session is closed

## 6. How Sync Works

The UI keeps local state in Zustand stores that are persisted to IndexedDB.

The sync engine wraps those stores and turns state changes into queued sync operations.

- store mutations are tracked as `insert`, `update`, or `delete`
- changes are queued in memory
- `SyncService` flushes batches to the backend every few seconds
- the batch endpoint is `POST /api/v1/sync/batch`
- the backend uses a transaction to upsert workflows, scenarios, workflow runs, sessions, and test results
- if the server already has a newer version, it records a conflict instead of blindly overwriting data

This gives the app a local-first feel while still keeping the database in sync with what the user is doing in the browser.

The backend also exposes a pull path so the UI can hydrate from server state on first load:

- `GET /api/v1/sync/pull/{clientId}`

## 7. Good First Workflow To Try

If you want to understand the system quickly, import [`test-workflow.json`](../test-workflow.json) into the UI.

That example shows:

- a service graph with a backend API and PostgreSQL
- a scenario with HTTP checks
- a scenario with database assertions
- a workflow bundle that can be translated and executed end to end

Before importing it, build the sample API image expected by the bundle:

```bash
docker build -t bun-user-api:latest ./test-api
```

## 8. Mental Model

The simplest way to think about the project is:

- the UI defines the workflow
- the translator turns the UI graph into executable service and test data
- Inngest coordinates the run
- the runner provisions containers and executes tests
- sync keeps the database aligned with local changes

That separation is what lets the app support both interactive editing and reproducible execution.

