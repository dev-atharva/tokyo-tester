# Human-only run-secret resolution

Status: accepted for the first browser-journey vertical slice on 2026-08-03.

## Decision

Workflow definitions persist only a `secretRef`. A secret value may enter Tokyo
Tester only through an authenticated human-facing UI, and it exists in two
deliberately separate lifetimes:

1. A **session secret** is held in memory by the human UI for convenient reuse.
2. On explicit run authorization, the required values are copied into a fresh
   **run secret** set owned by exactly one workflow run.

One reference name identifies one value across every selected scenario in a
workflow run. Authors who need different values use different names. Secret
names are not secret; values are.

AI clients may author and inspect references, discover which names a run
requires, create a secret-free run intent, and observe its state. No MCP tool,
agent API, workflow document, validation receipt, run-intent record, result, or
diagnostic accepts or returns a secret value.

## Session-secret vault

The UI owns one memory-only session-secret vault. Its lookup key is the
authenticated user, project, workflow, and exact `secretRef`; values never
implicitly cross a workflow or project boundary. The vault is not serialized
to local storage, session storage, IndexedDB, URL state, Zustand persistence,
sync operations, analytics, or server persistence.

The run dialog derives the sorted, distinct required references from the exact
normalized scenario selection. For each reference it shows either a masked
input or `NAME — Available this session`. An available value has only **Replace**
and **Clear** controls: the UI does not reveal or copy it. Starting a direct run
or authorizing a handoff automatically uses all available required values;
missing values must be entered. The human explicitly authorizes every run, but
does not reselect or re-enter available values.

The UI clears the applicable values on explicit clear, logout, loss of project
authorization, workflow removal, page reload, tab close, or browser close.
Keeping the application open may retain them for multiple runs of that same
workflow. This is convenience, not durable credential storage, and the product
must describe it as **available this session**, never **saved**.

## One authorization path

Direct UI runs and MCP handoffs converge on the same server-side authorization
operation. The operation receives an authenticated human, an exact execution
selection, and the resolved values; it then:

1. Re-loads the exact workflow revision or validated bundle and scenario
   selection rather than trusting client-declared requirements.
2. Derives the required reference set and rejects missing, empty, duplicate,
   unknown, or extra values before service provisioning or job creation.
3. Confirms the human may execute that project and workflow.
4. Atomically consumes a run intent when present and creates one workflow run
   under the request's idempotency key.

A direct UI run authorizes and submits in one request. An MCP request uses the
run intent described below. Both bind the same immutable execution identity
and use the same preflight and run-creation module. Repeated submissions under
one idempotency key therefore cannot create multiple runs accidentally.

## Resumable MCP human handoff

When an MCP run requires secret references, the run tool creates a secret-free
**run intent** and returns an expected `human_input_required` tool result. This
is not a protocol or tool error. Its model-visible fields are limited to:

- an opaque run-intent identifier;
- a human-facing handoff URL;
- the required secret-reference names;
- creation and expiry times;
- the secret-free workflow/revision and scenario-selection summary.

The intent is scoped to the requesting principal, project, exact normalized
bundle or immutable revision, selected scenarios, and idempotency key. It
expires after 15 minutes and is never revived. An authorized human opens the
handoff URL, reviews the bound selection, automatically reuses matching session
secrets, fills any missing values, and explicitly authorizes the run.

The state machine is:

```text
awaiting-human -> submitting -> submitted
       |              |
       +-> cancelled  +-> cancelled
       |
       +-> expired
```

The `awaiting-human` to `submitting` transition is a compare-and-swap. Only one
authorizer can consume the intent. `submitted` records the resulting workflow
run identifier, but never secret material. Cancellation or expiry destroys the
opportunity to submit; a new MCP call must create a new intent.

MCP polls the opaque intent through a status operation rather than relying on
an MCP transport session. Poll results expose the state, reference names,
expiry, and eventual workflow-run identifier. They do not expose whether a
particular value is currently cached in the human UI. Once submitted, existing
workflow-run status and diagnostic tools take over.

## Transport and durable queue

The human-authorized endpoint accepts values only over the authenticated TLS
connection. It immediately constructs a non-serializable `RunSecrets` value
whose API provides lookup by required reference and deliberately has no string,
formatting, logging, or JSON representation.

The durable worker must survive process restarts, so the complete job payload
may be persisted only as authenticated ciphertext using the runner's existing
AES-256-GCM queue envelope. The nonce and ciphertext are stored separately;
the encryption key remains outside the database. Workflow definitions,
revisions, run-intent rows, sync records, execution events, receipts, exports,
results, diagnostics, and searchable metadata never contain secret values.

An idempotency or request fingerprint must either exclude secret values or use
a server-keyed MAC. An unkeyed digest of a secret-bearing plaintext payload is
forbidden because it can become an offline verifier for low-entropy secrets.

The worker decrypts only after claiming the job, constructs the in-memory
`RunSecrets`, and discards the plaintext request representation. A scenario
receives only the subset it references. Values reach the isolated browser
executor through the bounded attached-input protocol, never command-line
arguments, environment variables, labels, mounted files, URLs, or Docker
metadata.

Queue ciphertext remains available only while it is necessary for durable
delivery. Success, failure, cancellation, expiry after claim, and cleanup paths
clear the stored ciphertext and nonce. The worker terminates the executor,
destroys its in-memory secret set, and best-effort overwrites mutable buffers on
every terminal path. These measures reduce lifetime; they are not presented as
a guarantee against process-memory forensics.

## Redaction and evidence

Redaction is installed before any browser request, progress event, executor
output, error, or evidence metadata is observed. Runner-owned messages identify
only the reference name. Streaming redaction must work across chunk boundaries
and cover the raw value plus a bounded set of common transport encodings. Tests
use sentinel values and scan protocol output, events, logs, diagnostics,
manifests, and retained artifacts for both raw and encoded forms.

Redaction is defense in depth, not permission to emit values. The executor
protocol forbids echoing inputs, and structured results cannot contain them.
Any journey resolving a run secret suppresses Playwright traces because a trace
cannot currently be comprehensively sanitized. The result-and-evidence design
owns screenshot policy and other artifact-specific constraints.

An application under test can still deliberately transform and disclose a
credential in its own rendered output. Documentation must recommend scoped,
disposable test credentials and explain that Tokyo Tester cannot sanitize
arbitrary application behavior with certainty.

## Module boundaries

Secret handling is one deep runner module rather than repeated map and logging
logic at API, queue, and executor call sites. Its public concepts are:

- derive required reference names from a normalized execution selection;
- construct a run-scoped, non-serializable secret set from an exact required
  set and human-supplied values;
- obtain a reference value only for an authorized invocation;
- destroy the run-scoped set.

The module owns set equality, normalization, lifetime tracking, safe errors,
redactor construction, and destruction. The browser-journey module receives
this opaque `RunSecrets` value through its already accepted single-call seam.
Neither module exposes a general credential store or a serializable secret map.

## Verification surface

The implementation is incomplete until tests prove:

- reference derivation across one and multiple selected scenarios;
- same-name sharing and different-name separation;
- per-user, project, and workflow session-vault isolation;
- masked automatic reuse, replacement, clearing, and lifecycle cleanup;
- identical preflight behavior for direct UI and handoff authorization;
- 15-minute intent expiry, cancellation, atomic single use, idempotency, and
  polling through submission;
- authorization and revision/selection binding under stale or tampered input;
- rejection before provisioning for missing, empty, unknown, or extra values;
- encrypted queue persistence and terminal ciphertext cleanup on every path;
- absence from definitions, revisions, sync, receipts, events, results,
  diagnostics, exports, logs, metrics, and traces;
- secret subset exposure per scenario and attached-protocol delivery;
- streaming redaction across chunk boundaries and common encodings;
- trace suppression for every secret-bearing journey;
- MCP schemas and results that cannot accept or return a value.
