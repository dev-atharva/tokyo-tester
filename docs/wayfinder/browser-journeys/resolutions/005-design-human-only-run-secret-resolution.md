---
ticket: ../tickets/005-design-human-only-run-secret-resolution.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Persist only durable `secretRef` names. A human-facing, memory-only session
vault retains values per authenticated user, project, workflow, and reference;
the UI displays only masked availability with Replace and Clear controls and
automatically reuses available required values after explicit authorization of
each run. One reference name supplies one shared value across every selected
scenario in that workflow run.

Direct UI execution and MCP handoff converge on one server-side preflight and
authorization path. An MCP request that needs secrets creates a secret-free,
single-use run intent bound to the exact execution selection, identity, and
idempotency key. It returns a normal `human_input_required` result with only
reference names, a handoff URL, an opaque polling handle, and a 15-minute
expiry. An authorized human resolves and approves the intent; AI clients never
receive, submit, or learn the cached availability of values.

Each authorized execution receives a fresh non-serializable run-scoped secret
set. The durable queue contains only its existing authenticated AES-GCM job
ciphertext, and secret-dependent fingerprints must be keyed rather than plain
digests. The worker decrypts after claim, gives each scenario only its required
subset, sends values to the managed executor only through attached input,
installs streaming redaction before output, suppresses traces for any
secret-bearing journey, and clears ciphertext plus in-memory values on every
terminal path. The complete UI, intent, transport, cleanup, redaction, MCP, and
verification contract is recorded in [Human-only run-secret resolution](../../../architecture/human-only-run-secret-resolution.md).
