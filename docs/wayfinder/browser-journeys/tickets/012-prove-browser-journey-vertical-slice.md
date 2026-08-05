---
id: browser-journeys-012
title: Prove the browser-journey vertical slice end to end
status: open
parent: ../map.md
labels:
  - wayfinder:task
assignee: primary-agent
blocked_by:
  - browser-journeys-008
  - browser-journeys-009
  - browser-journeys-010
  - browser-journeys-011
---

## Question

Build the smallest representative frontend workflow and automated acceptance
coverage that prove UI and AI authoring, a passing navigation/form journey, a
deliberately failing URL or visibility assertion with evidence, human-only
secret resolution, durable result rendering, cleanup, and unchanged v2
execution. Also prove the required Chromium sandbox and private-IPC policy with
the runner-in-Compose and production Linux/Kubernetes topology; what evidence
demonstrates the destination and its release gates are reached?

## Evidence — 2026-08-04

- `bun run test:docker --grep "a UI-authored browser journey"` passes the
  production-build Compose path (`2 passed`). The UI authors a three-step
  navigation/form/URL journey and a deterministic failing journey, supplies the
  exact run secret through the authenticated human dialog, verifies aggregate
  and nested results, downloads the non-secret PNG evidence, reloads the durable
  failure result, and verifies executor/network cleanup.
- `bun run test:docker --grep "agent setup verifies MCP"` passes (`2 passed`).
  It covers capability discovery, unchanged v2 behavior, exact v3 browser
  bundle validation/import, the packaged Tokyo Tester skill, origin protection,
  and token revocation.
- The whole-stack proof found and fixed two cross-layer production defects: sync
  requests are now serialized and queued edits are rebased onto committed
  server entity versions; the production Docker context now retains Next.js
  artifact proxy routes instead of excluding every source directory named
  `artifacts`.
- `go test ./pkg/browserjourney ./pkg/workflowbundle ./pkg/mcpserver ./pkg/api
  ./pkg/runsecret` passes. Focused UI coverage passes 33 tests across sync,
  browser results, run-secret derivation, bundle compatibility, and journey
  validation; UI and E2E TypeScript checks pass.
- `E2E_RUNNER_APP_ENV=production E2E_BROWSER_CHROMIUM_SANDBOX=true docker
  compose -f e2e/stacks/docker-compose.yml config` renders the pinned browser
  executor, production mode, sandbox requirement, 128 PID limit, and persistent
  artifact volume. `bash -n e2e/scripts/browser-release-gate.sh` passes.
- `bash e2e/scripts/browser-release-gate.sh compose-linux` exits 2 on this
  Darwin Docker Desktop host with `Browser release gate requires a dedicated
  Linux host`; the gate fails closed instead of treating local Desktop execution
  as production sandbox evidence.

## Evidence — 2026-08-05

- The workflow gallery now includes a valid v3 **Browser checkout journey**
  starter backed by the repository-owned `tokyo-test-api:latest` fault-lab
  image. It authors navigation, a human-only `checkout.password` fill, and a URL
  assertion while keeping the demo workflow green.
- `make prod-browser-demo` builds that fixture through the host Docker daemon
  before starting the supported production stack. The locally built container
  was smoke-tested at `/browser-journey`, and focused template, bundle, journey,
  run-secret, result, fixture, type-check, and formatting coverage passes.
- This removes any dependency on an external UI application image for the
  dedicated-server manual smoke test. It does not replace the production
  sandbox/private-IPC gate below.

## Remaining release gate

Run `browser-release-gate.sh compose-linux` on a dedicated Linux host or
`browser-release-gate.sh kubernetes` against the production deployment and
capture a passing sandbox/private-IPC execution. This ticket remains open until
that topology-specific runtime evidence exists; local Docker Desktop evidence
does not satisfy it.
