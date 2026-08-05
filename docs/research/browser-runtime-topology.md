# Managed-browser runtime topology

Research date: 2026-08-02

## Question

How can the Go runner provision a pinned, headless Chromium runtime inside each scenario's Docker network, execute one browser journey reliably, collect screenshots and Playwright traces, enforce runner-owned resource limits, and clean everything up without installing browser binaries in the runner image?

## Recommendation

Use a **short-lived Tokyo-owned browser executor container per browser scenario**. The image should contain a small Node.js journey executor, the exact matching Playwright package, and its pinned Chromium build. The Go runner remains the lifecycle orchestrator: it starts the executor on the existing per-scenario Docker network after services are ready, sends one normalized journey over an attached stdin stream, receives structured progress, copies failure artifacts out, and terminates the executor before removing the workflow network.

Do not expose a Playwright WebSocket or HTTP control port in the first slice. Do not install Chromium, Playwright browsers, or an unofficial Go Playwright client in the runner.

```text
Go runner
  | Docker/Testcontainers lifecycle + attached stdin/stdout
  v
browser executor container (Node + exact Playwright + Chromium)
  | http://<service network alias>:<container port>/<path>
  v
target UI service + its dependencies

All workload containers share the scenario's user-defined Docker bridge.
No browser control port is published to the host.
```

This is a supported composition of the existing stack:

- Playwright officially supports JavaScript/TypeScript, Python, Java, and .NET, but does not list Go as a supported client language. A Node executor therefore stays on Playwright's supported API surface while keeping the runner in Go ([Playwright supported languages](https://playwright.dev/docs/languages)).
- Playwright's Docker image contains browser builds and system dependencies but not the Playwright package; its documentation requires the package/image versions to match and recommends pinning a specific image version ([Playwright Docker guide](https://playwright.dev/docs/docker)). Tokyo Tester's executor image should install the exact package version matching its base image, and its deployable image reference should be pinned by digest so upgrades are deliberate and auditable ([Docker image pinning guidance](https://docs.docker.com/build/building/best-practices/#pin-base-image-versions)).
- User-defined Docker bridges provide network-scoped DNS by container name or alias. Containers on the same bridge can reach each other's container ports without publishing those ports to the host ([Docker bridge networking](https://docs.docker.com/engine/network/drivers/bridge/)). Testcontainers Go supports attaching a container to an existing network with aliases ([Testcontainers Go networking](https://golang.testcontainers.org/features/networking/#advanced-networking)).

## Why a one-journey executor is the best first topology

The executor owns the browser process and Playwright client in one versioned image. That removes remote-protocol version skew, avoids a host-published control endpoint, makes a scenario's browser state and resource consumption have the same lifecycle boundary, and makes an executor crash affect only one scenario.

The container should create exactly one non-persistent `BrowserContext` and one `Page`. Playwright documents non-persistent contexts as isolated sessions that do not write browsing data to disk; closing the context disposes it ([BrowserContext API](https://playwright.dev/docs/api/class-browsercontext)). The executor should run steps sequentially, fail fast, mark later steps skipped, close the context/browser in `finally`, and remain available just long enough for the runner to extract results and artifacts.

The executor is a **runner implementation detail**, not a user service and not a reusable browser pool. It should nevertheless carry the same ownership labels as other managed containers so the existing janitor can recover it after a runner crash.

## Proposed lifecycle and data path

1. The existing orchestrator creates the scenario network and provisions all application services. It waits for the selected UI service and its dependencies to become ready.
2. The runner creates the executor with:
   - the Tokyo-owned browser image pinned by immutable digest;
   - the existing managed/session/workflow/scenario labels;
   - the existing scenario network and a runner-generated alias;
   - no published ports and no host bind mounts;
   - a runner-owned deadline and cgroup limits;
   - an init process, non-root user, and the reviewed Chromium sandbox/seccomp configuration.
3. The executor starts headless Chromium explicitly, emits a machine-readable `ready` event, and waits for exactly one framed request on stdin. The request contains the normalized journey, internal base URL (`http://<service-alias>:<container-port>`), and resolved run secrets. Docker supports attaching stdin independently of a TTY; `--init` supplies a signal-forwarding, child-reaping PID 1 ([Docker run reference](https://docs.docker.com/reference/cli/docker/container/run/#keep-stdin-open--i---interactive), [Docker init-process guidance](https://docs.docker.com/reference/cli/docker/container/run/#specify-an-init-process)). The request and secrets must never be put in environment variables, command arguments, container labels, or logs because those surfaces are inspectable.
4. The executor emits bounded NDJSON progress/results on stdout without echoing literal values. Each event includes the step id, state, duration, current URL when obtainable, and a typed error. This stream is operational progress, not the durable artifact channel.
5. The executor starts Playwright context tracing before the journey. On the first failure it captures a screenshot, stops tracing to a ZIP, writes a final result manifest, emits `result_ready`, and waits. Playwright can save screenshots to files or return buffers, while `context.tracing` can capture screenshots, DOM snapshots, and browser/network activity into a trace ZIP ([Playwright screenshots](https://playwright.dev/docs/screenshots), [Playwright tracing](https://playwright.dev/docs/api/class-tracing)). On success, it stops/discards the trace and retains only structured results and final URL.
6. After `result_ready`, the runner copies the manifest and allowed failure artifacts from the still-running executor, validates size/content type, persists them through Tokyo Tester's artifact store, and then terminates the executor. Testcontainers Go supports copying files out with `CopyFileFromContainer`; its file-copy APIs are portable to remote Docker daemons, unlike host bind mounts ([Testcontainers Go files and mounts](https://golang.testcontainers.org/features/files_and_mounts/#copying-files-from-a-container)).
7. The runner terminates the executor on completion, cancellation, timeout, or extraction failure, then performs normal service and network cleanup. If the runner dies first, the existing Tokyo ownership labels let the janitor remove the orphaned executor before the network. Testcontainers documents explicit container termination and network removal outside test cleanup helpers ([Testcontainers Go container lifecycle](https://golang.testcontainers.org/features/creating_container/#genericcontainer)).

The output files should live in a size-bounded tmpfs while the executor remains running. Docker documents tmpfs as ephemeral and useful for sensitive or non-persistent data, but also warns that Linux may swap tmpfs pages to disk ([Docker tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/)). Therefore resolved secrets should arrive only through stdin and stay in process memory; tmpfs is appropriate for generated evidence, not a claim of absolute secret non-persistence.

Testcontainers Go v0.40.0, which this repository currently uses, exposes the required primitives: an existing network can be attached by name, `WithTmpfs` and `WithHostConfigModifier` can customize the container, in-memory bytes can be copied with `CopyToContainer`, and files can be read with `CopyFileFromContainer` ([v0.40.0 Container API](https://pkg.go.dev/github.com/testcontainers/testcontainers-go@v0.40.0#Container), [common options](https://golang.testcontainers.org/features/common_functional_options/)). Direct stdin attachment will require the Docker client already used by the runner; it should be wrapped behind the browser-executor interface rather than leaking Docker concerns into step execution.

## Resource and isolation profile

Browser resources must be runner-owned and excluded from workflow payloads, like current service limits. Apply hard memory, CPU, memory-swap, and PID limits through `HostConfig.Resources`. Docker containers otherwise have no default CPU or memory ceiling, and Docker recommends bounding memory to protect the host from OOM instability ([Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/)). The existing `ResourceHostConfigModifier` is the right mechanism, but browser defaults should be independently configurable because Chromium's process and shared-memory profile differs from a small service.

No defensible universal numeric limit appears in the primary documentation. Start with an operator-owned browser profile, measure a representative login/navigation workload, and gate release on concurrency tests under the production host's configured scenario concurrency. Treat OOM kill, PID exhaustion, browser disconnect, and deadline expiry as typed infrastructure failures rather than assertion failures.

Playwright recommends `--init` and `--ipc=host` for Chromium because insufficient shared memory can crash it ([Playwright Docker guide](https://playwright.dev/docs/docker#recommended-docker-configuration)). `--ipc=host` weakens per-container isolation, so the production target should instead prototype a **private IPC namespace with a larger, bounded `/dev/shm`** configured through Docker's `ShmSize`; Docker exposes both IPC mode and shared-memory size controls ([Docker run reference](https://docs.docker.com/reference/cli/docker/container/run/)). This alternative is not the configuration Playwright explicitly endorses, so it is a release gate: run repeated Chromium journeys under peak concurrency and intentional memory pressure. If it is not stable, accepting host IPC must be an explicit security decision, not a silent fallback.

Run the executor as the image's unprivileged `pwuser` with Chromium's sandbox and Playwright's documented seccomp additions for user namespaces. Never use `--privileged`, and do not ship the troubleshooting-only `SYS_ADMIN` capability. Playwright notes that its default root execution disables Chromium's sandbox and recommends a non-root user plus seccomp for untrusted pages; Docker warns that privileged mode effectively gives the container host-level power ([Playwright Docker security guidance](https://playwright.dev/docs/docker#crawling-and-scraping), [Docker privileged-mode warning](https://docs.docker.com/reference/cli/docker/container/run/#escalate-container-privileges---privileged)).

The executor needs no Docker socket, host filesystem mount, or host network. Give it only the per-scenario bridge. A normal Docker bridge still permits outbound network access when the host has Internet access ([Docker networking overview](https://docs.docker.com/engine/network/)); if browser journeys must be prevented from reaching arbitrary Internet or metadata endpoints, that requires a separate egress-policy design at the Docker host/firewall layer.

## Failure evidence behavior

The executor must attempt evidence capture in this order so diagnostic work does not hide the original failure:

1. Record the original typed step failure and current URL if the page is still usable.
2. Best-effort screenshot to a size-bounded output path.
3. Best-effort trace finalization.
4. Atomically publish the final result manifest and `result_ready` event.
5. Keep the container alive for a bounded extraction grace period; the runner terminates it after copying.

If Chromium or the container is killed abruptly, trace finalization may be impossible. The runner should inspect container state/exit code/OOM status and persist bounded executor logs as an infrastructure diagnostic. A trace is therefore guaranteed only for ordinary step failures, not process crashes, OOM kills, runner loss, or forced deadline termination.

### Secret-bearing traces are an unresolved release blocker

Text-log redaction does **not** make a Playwright trace safe. Official docs say traces contain browser operations, network activity, screenshots, and DOM snapshots ([Tracing API](https://playwright.dev/docs/api/class-tracing), [Trace Viewer guidance](https://playwright.dev/docs/best-practices/#debugging-on-ci)). In an official Playwright issue, a maintainer states that comprehensive hiding of sensitive information from reports/traces cannot be promised and suggests post-processing rather than a built-in scrubber ([Playwright secret-redaction request](https://github.com/microsoft/playwright/issues/31728)).

Consequently, the first implementation must not claim that `secretRef` values are redacted from trace ZIPs. Before release, choose and test one safe policy:

- **Recommended first-slice policy:** if a journey resolves any `secretRef`, suppress the trace artifact and retain only deliberately redacted structured diagnostics plus a screenshot captured with configured sensitive locators masked; document that arbitrary application-rendered secrets still cannot be comprehensively detected.
- Or require a separate, audited trace-sanitization pipeline and prove with fixtures that secrets are absent from action metadata, DOM snapshots, network data, and resources before persistence.

Persisting an unsanitized trace from a secret-bearing journey should not be the default.

## Alternatives considered

| Topology | Advantages | Problems | Verdict |
| --- | --- | --- | --- |
| Per-scenario Node executor containing Playwright and Chromium | Supported Playwright language; package and browser versions move together; no control port; direct access to service aliases; smallest failure domain; no browser bits in runner | Requires a small Tokyo-owned image and framed worker protocol; artifact extraction must happen before termination | **Recommended** |
| Playwright `run-server` container plus a Node client in the runner | Official remote connection mode; browser binary remains outside runner | Playwright client still must be added to the runner; exact client/server version coupling; published/mapped WebSocket control endpoint; split cleanup and artifact ownership | Defer until remote-browser reuse is a real requirement |
| Playwright server plus an unofficial Go client | Runner could appear Go-only | Go is not an officially supported Playwright language; protocol compatibility and trace behavior become Tokyo Tester's burden | Reject |
| Raw Chromium DevTools Protocol controlled from Go | Mature Chromium control options exist outside Playwright | Does not produce Playwright traces and would force Tokyo Tester to reimplement locator/action/auto-wait semantics | Reject for this slice |
| Long-lived pooled browser service shared by scenarios | Lower cold-start cost | Cross-scenario isolation, version rollout, capacity accounting, stale contexts, and recovery become substantially harder; conflicts with one isolated session per scenario | Defer |
| Bake Chromium into the Go runner | Simple local process control | Enlarges and couples the privileged runner image to browser patching; browser crash/resource state shares the runner boundary; violates the stated requirement | Reject |

Playwright's remote server is real and officially documented, including the requirement that remote client and server versions match ([Playwright remote connection](https://playwright.dev/docs/docker#remote-connection)). It is simply unnecessary for the first vertical slice because the whole journey can execute beside the browser in one ephemeral container.

## Risks and unknowns to close with a prototype

1. **Private shared memory stability.** Prove private IPC plus a bounded `ShmSize` works across the supported Linux Docker host, Docker Desktop development, runner-in-Compose, and host-runner modes. Compare it with Playwright's documented `ipc=host` baseline under concurrency and memory pressure.
2. **Secret/evidence policy.** Resolve the trace conflict above. Test generated artifacts byte-for-byte with sentinel secrets. Screenshot masking alone is not comprehensive redaction.
3. **Executor I/O contract.** Prototype attached stdin and bounded NDJSON output using the repository's Docker client/Testcontainers v0.40.0. Verify cancellation, runner disconnect, malformed input, duplicate delivery, and that request payloads never appear in Docker inspect or logs.
4. **Artifact caps and extraction.** Select maximum screenshot, trace, manifest, and total artifact sizes. Test truncated/corrupt output and make extraction failure secondary to the original step failure.
5. **Crash recovery.** Kill the runner during browser execution and after `result_ready`; verify the janitor removes the labelled executor and then the network without deleting active work.
6. **Image supply chain.** Select the exact Playwright/Chromium version at implementation time, pin the final Tokyo executor image by digest, add vulnerability scanning/SBOM, and define a regular browser security-update cadence. A digest is reproducible but does not update itself.
7. **Threat boundary.** Playwright explicitly says its Docker image is intended for testing/development and is not recommended for visiting untrusted websites ([Playwright Docker guide](https://playwright.dev/docs/docker)). If workflow authors or provisioned applications are mutually untrusted, a container on a shared Docker host is not sufficient evidence of safe multi-tenancy; dedicated hosts, VMs, or a stronger sandbox need a separate architecture decision.
8. **Egress controls.** Decide whether the browser may reach the public Internet. A per-scenario bridge isolates unrelated containers but does not itself deny outbound traffic.

## Implementation-ready acceptance checks for this topology

The topology is ready to adopt when a prototype demonstrates all of the following:

- The stock Go runner image contains no browser executable or Playwright package.
- A digest-pinned executor launches one headless Chromium context/page and reaches the selected service through its network alias and container port, with no host-published browser control port.
- The same path works in supported host-runner and runner-in-Compose development modes and on the documented production Docker host.
- CPU, memory/swap, PID, deadline, and shared-memory settings are runner-owned and visible in Docker inspect; workflow input cannot raise them.
- Ordinary assertion failure yields structured steps, current URL, screenshot, and—only under the approved secret policy—a usable trace ZIP.
- Cancellation, OOM kill, browser crash, malformed input, and artifact-copy failure become typed diagnostics and do not leak managed containers or networks.
- A runner crash leaves resources discoverable by existing Tokyo ownership labels, and janitor recovery removes them.
- Sentinel secret values are absent from container configuration, command arguments, environment, labels, runner/executor logs, structured results, and every persisted evidence type permitted by the chosen policy.

## Decision

The managed-browser runtime topology is feasible without browser binaries in the Go runner. Adopt a **digest-pinned, per-scenario Node/Playwright/Chromium executor job attached only to the workflow network**, controlled through Docker lifecycle plus attached stdin/stdout, with artifacts copied out before termination. Treat private shared-memory stability, secret-bearing trace retention, and hostile-page isolation as explicit prototype/security gates rather than assuming the container boundary solves them.
