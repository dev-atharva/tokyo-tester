---
ticket: ../tickets/009-implement-run-secret-resolution.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Implemented human-only run-secret resolution through one authenticated
authorization path. The run dialog derives the sorted, distinct reference set
from the exact selected journey scenarios, keeps values in a non-persisted
Zustand vault scoped by authenticated user, project, workflow, and reference,
and presents only a masked `Available this session` state with Replace and
Clear controls. Logout, project loss or switching, workflow removal, reload,
and browser/tab closure clear the applicable lifetime naturally or explicitly.
Each run still requires a deliberate human click and automatically reuses all
available required values without revealing them.

The human-only Next.js endpoint rechecks the authenticated user's project run
permission and binds the request identity before forwarding over the private
runner connection. The runner reloads the synchronized workflow plus exact
selected scenarios before deriving requirements, so stale or tampered client
requirements cannot omit a secret. Its new deep `runsecret` module owns exact
set equality, same-name sharing, per-scenario subsets, non-serializable opaque
run sets, destruction, queue payload encoding, common-encoding redaction, and
cross-chunk streaming redaction. Missing, empty, duplicate, unknown, and extra
values fail before job admission or service provisioning. Ordinary submission
returns only a human-authorization requirement and reference names for a
secret-bearing selection; MCP run intents and polling remain in the dedicated
agent-path ticket.

Authorized values are copied into one fresh run-scoped set, encoded only inside
the existing AES-256-GCM durable job envelope, and excluded from the secret-free
idempotency fingerprint. The worker decrypts only after claim, installs the
run redactor in its context, gives each scenario only its referenced subset,
and sends those values to the isolated browser executor solely through the
bounded attached-input payload. Queue plaintext buffers and scenario/run sets
are best-effort cleared; terminal success, failure, cancellation, and exhausted
recovery paths clear ciphertext and nonce while interrupted recoverable jobs
retain only ciphertext.

Run logs, activities, results, diagnostics, and failure records pass through
raw, JSON-escaped, URL, base64, and hex redaction before persistence. The
managed executor's existing defense-in-depth policy is now reached with the
real per-scenario secret set: every secret-bearing journey avoids starting a
trace, never takes a failure screenshot, and the runner forcibly materializes
both evidence slots as suppressed without artifact identifiers. Values never
enter workflow definitions, sync records, revisions, exports, results, or
artifact metadata; integration coverage decrypts the queue only in-test to
prove the public request and execution revision remain value-free, then proves
terminal cancellation removes the encrypted payload.

Verification passed with the complete Go suite, focused authorization and
redaction integration coverage, `go vet` on the affected packages, all 139
database-independent UI tests, TypeScript checking, Biome checking, and a
production Next.js build. The repository's UI MySQL integration tests were not
rerun because no UI test database was available; the changed UI paths are
covered by focused unit tests and the production build.
