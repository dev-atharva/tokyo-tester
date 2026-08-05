# Workflow authoring reference

## Bundle shape

Use kind `cots.workflow-bundle`. Schema version 2 remains valid for legacy-test-only bundles; use schema version 3 when any scenario uses the `journey` execution model. In v3 every scenario declares either `legacy-tests` or `journey`. Retrieve the live detailed contract with `tokyo_get_capabilities`; the published schemas are `contracts/workflow-bundle-v2.schema.json` and `contracts/workflow-bundle-v3.schema.json` in the Tokyo Tester repository.

## Graph modeling

- Give every node a stable unique id and a human-readable label.
- Use `generic` for the user's application image; it requires `image`.
- Use provider types for infrastructure: PostgreSQL, MySQL, MariaDB, Redis, Memcached, MongoDB, RabbitMQ, or Kafka.
- Reference another service at runtime with `${service_name.host}` or `${service_name.env.KEY}` only when the readiness graph makes that service reachable.
- Use `source_requires_target` when the source must wait for the target, `target_requires_source` for the reverse, and `none` for architecture-only relationships.

## Test design

- HTTP: exercise a container port and assert status plus a stable response fragment.
- Database/document/cache/queue: pair an application action with a direct infrastructure assertion when proving integration behavior.
- Shell: reserve for checks that cannot be expressed through a specialized test type.
- Delay: use only for an externally asynchronous transition; prefer readiness and deterministic polling where available.
- Put every test id exactly once in `testOrder`. Use `dependsOnTestIds` for actual data or control dependencies.

## Browser journey design

- Set `executionModel` to `journey` and target one managed browser at a provisioned UI service using its sanitized `targetService` and container `targetPort`.
- Put every step id exactly once in `stepOrder`; steps run sequentially and fail fast.
- First-slice actions are `navigate`, `fill`, and `click`. Assertions are URL/path (with an optional query subset) and visible locator. `delay` is the only control step.
- Use accessibility-first locators: `role` plus accessible `name`, `label`, visible `text`, or `testId`. Do not invent CSS or XPath locators.
- A fill value is either a literal or a `run-secret` reference. Author only `secretRef`; runtime secret values are supplied by a human outside MCP and workflow JSON.
- Browser execution is runner-managed and headless. Do not configure external browser endpoints or host ports.

## Repair loop

Validation errors contain a code, JSON pointer, message, and suggestion. Edit only the pointed portion unless the error reveals a mistaken service model. Runtime diagnostics are redacted; correlate scenario and test names with repository logs and configuration before changing expectations.

Successful validation returns a normalized `bundle` and an expiring `validationReceipt` bound to that exact JSON. Present the normalized workflow for approval, then pass both values unchanged to import or run. Never attach a receipt to a locally edited, reconstructed, or previously validated bundle; validate again after every edit or expiry.

## Human run handoff

A run with no `run-secret` references starts normally. A secret-bearing selection returns `kind: "human_input_required"`, an opaque `runIntentId`, required reference names, a human-facing URL, exact project/workflow/scenario selection summary, and a 15-minute expiry. This is a successful tool result, not an error. Give the URL to the human and poll `tokyo_get_run_intent`; never ask for values or session-vault availability. Continue with `tokyo_get_run` only after status becomes `submitted` and supplies `workflowRunId`. Expired or cancelled intents are terminal and require a newly approved run request.

Failure diagnostics include compact browser step, sanitized location, and evidence-status data. Fetch a PNG with `tokyo_get_run_screenshot` only when diagnostics expose an available screenshot artifact and the visual is useful. The tool is read-only and reauthorizes the run and artifact. Traces remain UI-only; suppressed, expired, cross-project, trace, and unknown artifacts are unavailable through MCP.
