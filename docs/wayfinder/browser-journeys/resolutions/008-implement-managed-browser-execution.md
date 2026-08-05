---
ticket: ../tickets/008-implement-managed-browser-execution.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Implemented the first managed Chromium execution slice behind the accepted
`browserjourney.Executor.Execute` seam. The API layer now provisions the
journey's service subset, passes only the normalized plan and an opaque
workflow-network attachment, persists one aggregate journey result, publishes
redacted journey/step progress plus an authoritative `journeyresult` event,
and cleans the executor and workflow resources on success, behavior failure,
infrastructure interruption, and cancellation. Interrupted journeys are never
automatically replayed after a step may have begun.

The digest-based Playwright 1.61.0 executor runs as `pwuser` with a read-only
root, private IPC, bounded `/dev/shm` and evidence tmpfs, no published ports or
bind mounts, all capabilities dropped, no-new-privileges, cgroup memory/CPU/PID
limits, runner ownership labels, attached stdin, and bounded NDJSON. It owns
one browser context and page, resolves only service-alias/container-port URLs,
executes navigate/fill/click/delay sequentially, uses Playwright's bounded
retrying visibility and URL assertions, fails fast, and lets the Go module
validate order and synthesize the skipped suffix.

Results use the accepted version-1 aggregate envelope, retain sanitized path
and query-key location evidence, keep journey/step counters separate from
legacy test counters, and preserve accepted partial step results on protocol
loss. Non-secret failures stream allow-listed PNG and ZIP artifacts through
per-kind and total limits. Any resolved run secret suppresses both screenshot
and trace creation, and sentinel-secret verification found no value in the
result or evidence. Artifacts are written atomically to a runner-owned
persistent directory, indexed by opaque project/run-scoped metadata, served
only after project and workflow-run authorization with safe response headers,
and expired by the retention janitor. Compose now uses a named volume and the
Kubernetes topology a PVC.

Verification passed for the pinned image build; focused package tests; the
complete Go/MySQL suite (`make test-go`); Compose rendering; Kubernetes
Kustomize rendering; and a real-Docker adapter test covering workflow-network
reachability, successful navigation/visibility, deliberate behavior failure,
screenshot and trace storage, strict secret-bearing suppression, cancellation,
resource inspection, and cleanup. Workflow-bundle v2 and legacy execution
tests remained green.

Chromium's Linux sandbox still cannot initialize on the tested Docker Desktop
kernel. The production constructor requires it and production configuration
rejects disabling it; Docker Desktop development uses a visible, explicit
`BROWSER_CHROMIUM_SANDBOX=false` override. Production Linux sandbox and
runner-in-Compose/Kubernetes proof is therefore retained as a release gate in
ticket 012 rather than silently weakened in this implementation.
