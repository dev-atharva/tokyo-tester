# Tokyo Tester whole-product E2E tests

The harness starts a clean production-image Docker stack, creates workflows
through guided mode, executes them with the real runner, and verifies HTTP and
Redis behavior, persisted results, and resource cleanup. It also exercises the
production control plane: queue and rate admission, historical ETA estimates,
SSE replay after a runner restart, paginated logs, cancellation, and enforced
container CPU, memory, and PID limits.

## Prerequisites

- Bun and Docker.

Install the pinned Playwright package and Chromium:

```sh
make e2e-install
```

Run the Docker journey:

```sh
make e2e-docker
```

Repeat the cleanup-focused workflow 20 times to detect leaked containers and
networks:

```sh
make e2e-docker-leak
```

The leak target raises only its test stack's submission budget; the normal
suite retains the strict three-submissions-per-minute user limit used by the
admission-control coverage.

Set `E2E_KEEP_STACK=1` to keep a failed stack available for inspection. Set
`E2E_BASE_URL` to run against an already-started compatible stack. Artifacts
default to `e2e/artifacts/<target>` and can be redirected with
`E2E_ARTIFACT_DIR`.

The normal suite keeps durations bounded for CI. The lease soak remains a
separate opt-in check (`make test-soak`) so a 10-minute or 24-hour run does not
turn every pull request into a soak test.

## Browser-journey release gates

### Manual dedicated-server demo

The repository includes its own small checkout UI, so a separate application
repository or published UI image is not required. On the dedicated Docker host,
build that fixture and start Tokyo Tester with:

```sh
make prod-browser-demo
```

In the workflow list, choose **Browse templates** and then **Browser checkout
journey**. Start the workflow and enter any non-empty value for the requested
`checkout.password` run secret. The run should finish successfully with three
browser steps. The fixture image is built locally as `tokyo-test-api:latest`
and is visible to the runner through the same host Docker daemon.

This is a useful manual smoke test, but it does not replace the sandbox and
private-IPC release gate below.

The ordinary Docker suite runs Chromium with its in-container sandbox disabled
because Docker Desktop cannot provide the production Linux sandbox profile. It
still proves the runner-in-Compose path, private IPC, read-only root filesystem,
resource limits, durable evidence, and cleanup because the runner rejects an
executor whose inspected container profile differs.

Run the production sandbox gate on a dedicated Linux Docker host:

```sh
make e2e-browser-linux
```

That target fails closed on non-Linux and Docker Desktop hosts, starts the
runner with `APP_ENV=production` and `BROWSER_CHROMIUM_SANDBOX=true`, and runs
the focused UI-authored pass/fail/secret journey. A passing report is the
runner-in-Compose Linux release artifact.

For the checked-in DinD Kubernetes topology, deploy `k8s/dind` with the browser
fixture and executor images available to its Docker daemon, then run:

```sh
E2E_BASE_URL=https://tokyo.example.com \
E2E_KUBERNETES_NAMESPACE=tokyo-tester \
make e2e-browser-kubernetes
```

The Kubernetes target verifies the live runner declares production mode and a
required Chromium sandbox, executes the same browser journey through the
deployed UI, and checks cleanup inside the DinD sidecar. Static manifest
validation is not accepted as runtime release evidence.
