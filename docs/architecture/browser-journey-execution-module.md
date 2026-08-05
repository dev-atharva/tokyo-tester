# Browser journey execution module

Status: accepted for the first browser-journey vertical slice on 2026-08-03.

## Decision

Add a browser-specific deep module at `runner-v2/pkg/browserjourney`. Its external seam has one operation:

```go
package browserjourney

type Executor interface {
	Execute(context.Context, Request) (Result, error)
}

type Request struct {
	Plan        workflowbundle.JourneyPlan
	Environment ProvisionedEnvironment
	RunSecrets  RunSecrets
}

type ProvisionedEnvironment struct {
	Attachment NetworkAttachment
}
```

`NetworkAttachment` is an opaque runner-issued token that lets the production adapter join the already-provisioned workflow network. No Testcontainers container, Docker client, Docker network object, host-mapped port, Playwright type, image reference, or browser flag crosses the external seam. The target service alias and container port remain in the normalized `JourneyPlan`.

`RunSecrets` is an in-memory, non-serializable value supplied by the human-only resolution path. It exposes only referenced values to the invocation and has no string or JSON representation. Ticket [Design human-only run-secret resolution across UI, runner, and MCP](../wayfinder/browser-journeys/tickets/005-design-human-only-run-secret-resolution.md) owns its exact construction and lifetime.

The accepted durable fields of `Result`, step failures, diagnostics, and artifact references are recorded in [Browser journey results and failure evidence](browser-journey-results-and-evidence.md). The module interface guarantees that every result:

- contains every scenario step exactly once and in normalized order;
- marks the first behavior failure as failed and every later step as skipped;
- retains accepted partial results when infrastructure interrupts execution;
- includes final URL, timing, redacted failure information, and only permitted artifact references;
- never includes a run-secret value.

## Caller seam

The API/durable-workflow layer remains responsible for translation, secret preflight, service provisioning, durable persistence, and cleanup of the system under test. After provisioning it performs one browser call:

```go
result, runErr := h.browserJourneys.Execute(ctx, browserjourney.Request{
	Plan:        *translated.Journey,
	Environment: browserjourney.ProvisionedEnvironment{
		Attachment: orch.NetworkAttachment(),
	},
	RunSecrets: resolvedRunSecrets,
})
```

The caller maps the domain result into API and persistence representations. It does not loop over steps, build an origin, interpret NDJSON, substitute secrets, choose evidence, redact messages, provision the managed browser, or terminate its executor.

The existing `legacy-tests` branch continues through the current test registry, retry, checkpoint, diagnostic, and result path. Shared scenario provisioning and final cleanup may be extracted into helpers, but legacy execution semantics must not be rewritten to fit the journey module.

## Module invariants

One `Execute` call owns one managed browser, browser session, and page for the complete browser journey. The module validates the normalized plan defensively and then:

1. Confirms the browser driver, target, ordered steps, supported operations, and referenced run secrets.
2. Constructs the internal origin from the workflow-network service alias and configured container port. Full external URLs remain impossible.
3. Installs redaction before serializing values or observing executor output.
4. Starts one digest-pinned executor with runner-owned security, resource, deadline, ownership-label, and network policy.
5. Sends the complete journey once and consumes bounded, versioned events in strict step order.
6. Executes sequentially in the shared browser session and stops on the first failure. Actions receive no generic retry; Playwright actionability and retrying assertions remain bounded by the step deadline.
7. Synthesizes skipped results for the unattempted suffix rather than trusting the remote executor to provide a complete aggregate.
8. Streams only allow-listed artifacts through per-artifact and total byte limits before terminating the executor.
9. Terminates the executor on every path using a bounded cleanup context independent of request cancellation.

Evidence policy is trusted constructor configuration, not a `Request` field. A journey that resolves any run secret suppresses both screenshots and Playwright traces regardless of other policy. Image digest, Chromium engine, sandbox/seccomp requirement, IPC mode, `/dev/shm`, tmpfs, CPU, memory, PID, artifact, and protocol limits are likewise runner policy. Initial evidence maxima are a 256 KiB result manifest, 4 MiB PNG, 25 MiB trace, 32 MiB retained total, and 40 MiB evidence tmpfs.

## Outcome and error semantics

An action or assertion mismatch is an authoritative journey outcome: `Result` is failed and the Go error is nil.

A typed `RunError` means the module could not produce a wholly authoritative outcome. Error kinds cover invalid request, runtime launch/policy, transport, protocol, evidence, cancellation, and executor cleanup. The module may return both a partial `Result` and a `RunError`:

- accepted completed steps remain unchanged;
- the active step is marked interrupted when its outcome is unknown;
- later steps are skipped;
- evidence or cleanup failure never erases the primary behavior failure;
- cancellation remains detectable through `errors.Is`.

The error records whether any step began. The durable worker must not automatically replay a journey once a step may have started. Because the browser session is ephemeral, Tokyo Tester does not resume at a step checkpoint; recovery marks the scenario as an interrupted journey and requires a new explicitly initiated run.

## Internal seams and adapters

Sequencing, fail-fast aggregation, protocol-state validation, redaction, evidence-policy enforcement, and skipped-step synthesis are in-process implementation details. They do not get separate interfaces.

Three behaviors genuinely vary and therefore have private seams:

- **Executor adapter** — the production Node/Docker adapter manages the attached protocol and container lifecycle; a scripted in-memory adapter drives module-interface tests.
- **Artifact sink** — the production adapter stores bounded artifact streams and returns opaque references; an in-memory adapter supports tests.
- **Progress sink** — the production adapter publishes redacted activities through `executionevent.Report`; recording and no-op adapters support tests. Progress publication is best-effort and cannot change the journey outcome.

The production executor adapter owns the digest-pinned image, attached stdin/stdout, versioned NDJSON, workflow-network attachment, non-root user, private IPC, bounded `/dev/shm`, read-only root filesystem, capabilities, no-new-privileges, cgroup limits, tmpfs evidence staging, size-bounded exec-stream extraction, termination, and janitor-compatible labels. These details remain invisible to callers.

The current Docker Desktop prototype required `chromiumSandbox: false`; production implementation must not silently preserve that fallback. A supported Linux Chromium sandbox/seccomp policy and runner-in-Compose/production-host validation remain release gates for the managed-browser implementation and end-to-end proof tickets.

## Verification surface

Tests cross the same `Executor.Execute` seam used by callers and cover:

- successful ordered execution in one browser session;
- action, assertion, timeout, and fail-fast skipped-suffix outcomes;
- missing run-secret rejection before executor launch;
- malformed, oversized, duplicate, unknown, and out-of-order protocol events;
- interruption before and after a step begins;
- screenshot and trace suppression plus sentinel-secret absence across progress, diagnostics, manifests, and artifacts;
- optional and required artifact failures without loss of the primary outcome;
- cancellation, graceful/forced termination, cleanup failure, and janitor recovery.

Docker integration tests separately verify the production adapter’s network reachability, resource and security inspection, artifact transport, cancellation, and cleanup. Runner acceptance tests verify both supported Docker deployment modes and unchanged v2 behavior.
