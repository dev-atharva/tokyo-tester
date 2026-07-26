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
