# Browser journey results and failure evidence

Status: accepted for the first browser-journey vertical slice on 2026-08-03.

## Decision

Persist one versioned aggregate `JourneyResult` for each journey scenario. It
contains one ordered `StepResult` for every scenario step, typed diagnostics,
sanitized final-location evidence, and the permitted evidence-artifact slots.
A scenario step is not persisted as a legacy test result.

The terminal aggregate stored on the scenario run is authoritative. Realtime
journey and step activities help users follow execution but are neither a
result journal nor a source from which clients must reconstruct the aggregate.
This lets event retention and transient stream disconnections remain separate
from durable result correctness.

Existing v1/v2 and v3 `legacy-tests` result, retry, checkpoint, summary, event,
sync, UI, and MCP behavior remains unchanged.

## Version-1 result envelope

The canonical durable and API representation uses camel-case JSON fields:

```json
{
  "schemaVersion": 1,
  "kind": "browser-journey",
  "scenarioId": "checkout",
  "outcome": "failed",
  "startedAt": "2026-08-03T10:00:00Z",
  "completedAt": "2026-08-03T10:00:04Z",
  "durationMs": 4000,
  "finalLocation": {
    "path": "/checkout/confirmation",
    "queryKeys": ["locale", "order"]
  },
  "steps": [],
  "diagnostics": [],
  "evidence": {
    "screenshot": { "status": "available", "artifact": {} },
    "trace": { "status": "available", "artifact": {} }
  }
}
```

`schemaVersion` versions the result envelope independently of the workflow
bundle and executor protocol. Unknown versions fail closed at persistence and
are shown as an unsupported-result diagnostic rather than being guessed.

The journey outcome is exactly one of:

- `passed` — every step passed;
- `failed` — one action or assertion produced an authoritative behavior
  failure;
- `interrupted` — Tokyo Tester cannot know the active behavior's outcome due
  to cancellation, browser or executor failure, protocol loss, or runner
  interruption.

Cancellation and cleanup are workflow/scenario execution-lifecycle states, not
journey outcomes. A journey that passes and then encounters cleanup failure
remains passed while the scenario becomes `cleanup_failed` and receives a
separate cleanup diagnostic.

## Step results and fail-fast completion

Each step result contains:

```json
{
  "stepId": "assert-confirmation",
  "sequence": 3,
  "name": "Confirmation is visible",
  "kind": "assertion",
  "operation": "visible",
  "outcome": "failed",
  "startedAt": "2026-08-03T10:00:02Z",
  "completedAt": "2026-08-03T10:00:04Z",
  "durationMs": 2000,
  "diagnosticId": "diagnostic-opaque-id"
}
```

The result contains every defined step exactly once, in normalized step order.
Step outcomes are `passed`, `failed`, `skipped`, or `interrupted`:

- A behavior mismatch marks the active step failed and every later step
  skipped with `skipReason: "prior-step-failed"`.
- Infrastructure loss after a step may have begun preserves earlier results,
  marks that active step interrupted, and skips the suffix with
  `skipReason: "journey-interrupted"`.
- Infrastructure loss before any step begins marks every step skipped with
  `skipReason: "journey-not-started"`.
- Cancellation during an active operation uses an interrupted step and the
  same skipped suffix; cancellation remains detectable on the scenario/run.
- A skipped step has no start/completion timestamp or duration. An interrupted
  step may contain the bounded timing known before the interruption.

The runner synthesizes and validates the skipped suffix. It does not trust the
remote executor to return a complete aggregate after failure.

## Location evidence

`finalLocation` is optional when no page location was observed. When present,
it contains only:

- the origin-relative path after known-secret redaction; and
- sorted, distinct query-key names.

The service-network origin, user information, query values, and fragment are
never retained. Diagnostics for URL assertions may identify missing or
mismatched query keys and reference the durable expected matcher, but never
persist observed query values. This preserves enough route context to explain
navigation failures without recording common token-bearing URL portions.

## Diagnostics

Browser diagnostics extend the existing execution diagnostic rather than
creating a second diagnostic system. Each persisted diagnostic gains a
result-local opaque `diagnosticId`; `code` remains the stable failure
classification. The existing source, confidence, stage, summary, scenario
identifier, affected-services, and bounded-evidence fields remain. Journey
diagnostics additionally allow `stepId` and `stepName`, and a step result links
to its diagnostic by `diagnosticId` without duplicating the payload.

Behavior failures use the service-environment source with likely confidence
unless Tokyo Tester has stronger evidence. Invalid normalized input is a
workflow-configuration failure. Executor policy, protocol, storage, and runner
implementation faults are Tokyo Tester or host-infrastructure diagnostics as
appropriate. Browser crash, timeout, OOM, and network ambiguity remain typed
rather than being recast as assertion failures.

Diagnostic messages are allow-listed structured summaries plus bounded,
redacted details. They never contain locator-resolved text dumps, DOM, request
or response bodies, cookies, headers, local storage, secret values, query
values, executor paths, or container configuration. Container logs retain the
existing bounded diagnostic treatment and pass through the run-secret redactor
before persistence.

Evidence capture or storage failure adds a secondary diagnostic such as
`evidence_capture_failed`, `evidence_limit_exceeded`, or
`evidence_storage_failed`. It never overwrites the primary behavior diagnostic
or changes an authoritative failed journey into an interrupted journey.

## Evidence policy

The two first-slice artifact kinds are a PNG failure screenshot and a
Playwright trace ZIP. Evidence slots make policy and capture failures explicit:

```json
{
  "status": "available | suppressed | unavailable | not-captured | expired",
  "reason": "secret-bearing | success-policy | capture-failed | limit-exceeded | storage-failed | retention-expired",
  "artifact": {
    "artifactId": "opaque-id",
    "kind": "screenshot | trace",
    "contentType": "image/png",
    "sizeBytes": 12345,
    "sha256": "hex-digest",
    "createdAt": "2026-08-03T10:00:04Z",
    "expiresAt": "2026-09-02T10:00:04Z"
  }
}
```

Only `available` carries an artifact reference. An expired response may retain
the opaque identifier and immutable metadata needed to explain what existed,
but download resolves to gone. Secret suppression never creates or returns an
artifact identifier.

Policy is:

- Successful journeys retain only the structured result; screenshot and trace
  slots are `not-captured` with `success-policy`.
- Non-secret failed journeys attempt the screenshot and trace after recording
  the primary failure and current location.
- Non-secret interrupted journeys attempt evidence only when the page and
  executor remain usable; absence is `unavailable`, not a new primary outcome.
- Any journey that resolves at least one run secret suppresses both screenshots
  and traces, regardless of outcome or configured evidence defaults. Both
  slots are `suppressed` with `secret-bearing` and contain no artifact ID.

This strict secret policy supersedes the prototype's masked-screenshot
experiment. Masking a known fill locator cannot prove that an application did
not render the value elsewhere. No audited Playwright trace sanitization exists
for the first slice.

## Resource limits

Artifact policy is trusted runner configuration and never workflow input. The
first-slice defaults are:

| Item | Default maximum |
| --- | ---: |
| Final result manifest | 256 KiB |
| PNG screenshot | 4 MiB |
| Playwright trace ZIP | 25 MiB |
| Total retained artifacts per journey | 32 MiB |
| Executor evidence tmpfs | 40 MiB |

The runner validates allow-listed filename, kind, content type, format magic,
per-artifact length, total length, and checksum while streaming from the
executor. It rejects an oversized or malformed artifact rather than truncating
it into a corrupt file. Operators may lower limits and may raise them only
within compiled safety ceilings. A limit failure produces unavailable evidence
and a secondary diagnostic.

## Storage, authorization, and retention

For the single-runner first slice, artifact bytes live in a runner-owned
persistent artifact directory:

- Docker Compose mounts a named volume;
- Kubernetes mounts a PVC;
- host-runner mode uses an explicitly configured directory.

Database rows store the opaque artifact identifier, project, workflow run,
scenario run, optional step, kind, media type, length, checksum, timestamps,
and internal relative storage key. The public result never exposes that key or
a filesystem path. Files are written with restrictive permissions through a
temporary file, validated while streaming, fsynced as required by the adapter,
and atomically renamed before metadata becomes available.

An authenticated endpoint resolves an artifact ID only after rechecking the
caller's project and workflow-run access. It sets an allow-listed content type,
safe download disposition, no-sniff and private/no-store headers; it does not
redirect to a permanent storage URL.

Artifact bytes use the workflow-event retention window, currently 30 days.
Deleting a workflow run deletes its artifact bytes and metadata immediately.
The retention janitor removes expired bytes and metadata idempotently; API
materialization uses the result's expiry metadata to report `expired` rather
than a broken link. Orphan-file and orphan-row cleanup is safe to repeat.

Database BLOB storage, public URLs, S3-compatible storage, and multiple-runner
shared artifact storage are deferred. A new storage adapter is justified when
the runner topology gains multiple replicas or a real external store.

## Persistence and realtime events

The complete envelope is stored in the existing scenario-run result snapshot
and included in the workflow run's scenario snapshot. It is never flattened
into `test_results`. A dedicated terminal `journeyresult` event carries the
same versioned aggregate for realtime reconciliation.

Best-effort progress adds two activity kinds through the existing execution
event path:

- `journey`: `started`, `passed`, `failed`, or `interrupted`;
- `step`: `started`, `passed`, `failed`, or `interrupted`, with step ID, name,
  sequence, kind, and operation.

The fail-fast skipped suffix is authoritative in the terminal aggregate; the
runner need not emit one progress event per synthesized skipped step. Event
messages are bounded and redacted before append. Losing, pruning, or replaying
progress events cannot change the stored result.

## Workflow summaries

Legacy counters keep their exact meaning:

- `totalTests`, `passedTests`, `failedTests`, `retriedTests`.

Journey-aware summaries add:

- `totalJourneys`, `passedJourneys`, `failedJourneys`,
  `interruptedJourneys`;
- `totalSteps`, `passedSteps`, `failedSteps`, `skippedSteps`,
  `interruptedSteps`.

A journey scenario contributes one journey and its nested step counts, but zero
legacy tests. A mixed workflow reports both sets. Existing fields are neither
renamed nor reinterpreted, and v2-only output remains backward compatible.

## UI and MCP

The run UI renders a journey as one scenario-level card with an ordered nested
step timeline. It distinguishes authoritative behavior failure, interruption,
skipped suffix, scenario cancellation, cleanup failure, unavailable evidence,
suppressed evidence, and expired evidence. Artifact controls appear only when
the current authorized response reports availability.

`tokyo_get_run` returns the compact aggregate and separate summary counters.
`tokyo_get_run_diagnostics` returns failed or interrupted journey/step context,
bounded redacted diagnostics, sanitized final location, and artifact status and
metadata. It never inlines artifact bytes or permanent URLs.

A separate read-only MCP artifact operation accepts one opaque artifact ID,
re-authorizes it against the caller's project and run, and may return an
available non-secret PNG screenshot as image content. It does not return
Playwright trace bytes; traces remain authenticated human-facing UI downloads.
Secret-bearing journeys have no screenshot or trace ID to request. Tool text
and structured result channels, when both used, carry identical JSON bytes.

## Verification surface

Contract and module tests must prove:

- one result per defined step in exact order for pass, behavior failure,
  pre-start interruption, mid-step interruption, cancellation, and cleanup
  failure;
- valid outcome, timestamp, duration, diagnostic-link, and skip-reason
  invariants for every state;
- canonical version-1 serialization, unknown-version rejection, terminal
  snapshot recovery, and realtime aggregate reconciliation;
- unchanged legacy test rows, counters, events, retries, and v2 responses;
- separate mixed-workflow journey and step counters;
- location sanitization and absence of origins, query values, fragments,
  credentials, secret values, DOM, cookies, storage, headers, and bodies;
- strict screenshot and trace suppression whenever any secret is resolved;
- best-effort evidence precedence and explicit capture, format, size, checksum,
  extraction, storage, and expiry failures;
- allow-listed artifact streaming under every per-file and total limit;
- atomic persistent-volume writes, restart durability, authorized download,
  project isolation, immediate run-deletion cleanup, expiry, and orphan cleanup;
- compact MCP diagnostics, on-demand non-secret screenshot retrieval, trace
  exclusion, and rejection of unknown, expired, cross-project, or suppressed
  artifact identifiers.
