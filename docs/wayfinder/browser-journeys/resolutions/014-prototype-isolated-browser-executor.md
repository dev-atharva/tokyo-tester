---
ticket: ../tickets/014-prototype-isolated-browser-executor.md
resolved_at: 2026-08-03
resolved_by: primary-agent
prototype_branch: codex/prototype-browser-executor
prototype_commit: d3dbfe4
---

## Resolution comment

The isolated executor lifecycle is feasible on the tested Docker Desktop host, but this experiment is not a production-runtime approval. The reproducible throwaway prototype at commit `d3dbfe4` passed a browser success, an ordinary failure, a secret-bearing failure, SIGTERM cancellation, and label-based janitor recovery. It used a digest-pinned Playwright 1.61.0 image, attached stdin and per-event-bounded NDJSON, one private workflow network, no published ports or bind mounts, private IPC, 256 MiB `/dev/shm`, a read-only root filesystem, `pwuser`, capability drop, no-new-privileges, and explicit memory, CPU, and PID limits. No labelled containers or networks remained after the run.

The executor wrote evidence to a private 16 MiB tmpfs. Docker Desktop's archive/copy API could not access that mounted tmpfs even when container exec confirmed the files existed, so the runner successfully recovered only allow-listed artifact names through a size-bounded exec stream before termination. Ordinary failure produced a manifest, screenshot, and trace. A secret-bearing failure produced a manifest and screenshot, suppressed the trace, and did not expose the sentinel secret in captured protocol, stderr, or artifact bytes.

Two release gates remain. First, Chromium's own sandbox failed to launch under the tested Docker Desktop kernel/security profile; the passing lifecycle used `chromiumSandbox: false` inside the hardened container boundary. The implementation must establish and verify a supported Linux sandbox/seccomp profile rather than silently normalizing that setting. Second, runner-in-Compose and production Linux modes were not exercised here. Ticket 003 must make artifact transport and sandbox policy explicit at the module seam, and tickets 008/012 must prove those host modes, cleanup, and hostile-page isolation before release.
