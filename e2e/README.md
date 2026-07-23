# Tokyo Tester whole-product E2E tests

The harness starts a clean production-image Docker stack, creates workflows
through guided mode, executes them with the real runner, and verifies HTTP and
Redis behavior, persisted results, and resource cleanup.

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

Set `E2E_KEEP_STACK=1` to keep a failed stack available for inspection. Set
`E2E_BASE_URL` to run against an already-started compatible stack. Artifacts
default to `e2e/artifacts/<target>` and can be redirected with
`E2E_ARTIFACT_DIR`.
