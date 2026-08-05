---
ticket: ../tickets/011-extend-mcp-and-agent-skill.md
resolved_at: 2026-08-03
resolved_by: mcp-skill-agent
---

## Resolution comment

Extended the agent and MCP path across discovery, review, strict v3
validation, exact normalized import and execution, browser diagnostics, and
unchanged v2 execution. The run tools keep the validation-receipt boundary and
stable idempotency keys. A secret-bearing exact selection now creates one
durable, single-use, 15-minute run intent instead of starting a run. Its
human-facing URL binds the requesting principal, user, project, operation,
workflow, scenarios, normalized bundle or persisted versions, and sorted
reference names. Polling reports only the terminal-safe state, expiry, bound
selection, reference names, and eventual workflow-run ID; neither MCP nor the
stored intent receives secret values or human session-vault availability.

The authenticated handoff page and API recheck project run permission (and
edit permission for import-and-run), atomically claim the intent, reject stale
persisted selections, and submit the exact authorized request through the
private runner path. Concurrent authorization has one winner, expired or
cancelled intents require a new idempotency key, and values are cleared from
request objects best-effort after forwarding. The intent store is available in
both MySQL and PostgreSQL schemas and migrations.

Agent diagnostics now retain compact workflow, scenario, aggregate browser
journey, ordered step, redacted diagnostic, final-location, and evidence-status
data while excluding definitions, logs, source-like payloads, and trace bytes.
The new screenshot tool requires an explicit run and opaque artifact ID,
reauthorizes the project/run relationship, returns only a bounded non-secret
PNG as MCP image content, and exposes no trace operation. Existing workflow
bundle v2 runs continue over the unchanged non-secret runner endpoint.

Updated Tokyo Tester MCP resources and product docs, then taught and repackaged
the Tokyo Tester skill with the human-input-required polling flow, secret
boundary, compact repair loop, explicit screenshot request, and UI-only trace
policy. Verification passed with the full Go suite, `go vet`, MCP contract and
media tests, eight focused UI agent/run-intent tests, TypeScript checking,
targeted Biome checking, the skill inspector/package checks, and a production
Next.js build including the handoff and agent routes.
