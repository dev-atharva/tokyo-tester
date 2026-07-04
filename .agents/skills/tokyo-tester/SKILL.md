---
name: tokyo-tester
description: Inspect an application repository, model its services and infrastructure as a Tokyo Tester workflow, author workflow-bundle JSON, validate or import it through the Tokyo Tester MCP server, run end-to-end scenarios, and repair failures from diagnostics. Use when integrating a project with Tokyo Tester or creating HTTP, database, document, cache, queue, shell, or delay tests.
---

# Tokyo Tester

Build the workflow from repository evidence, then use Tokyo Tester as the authoritative validator and executor.

## Workflow

1. Inspect the repository before drafting:
   - Find Compose files, Dockerfiles, exposed container ports, commands, health checks, and environment variables.
   - Find database migrations, queue/topic setup, cache usage, API routes or OpenAPI documents, and existing tests.
   - Never send repository files or secrets to Tokyo Tester tools.
2. Call `tokyo_get_capabilities`. Do not rely on remembered service types, test types, or schema versions.
3. Read [references/authoring.md](references/authoring.md), then create a complete `cots.workflow-bundle` object.
4. Call `tokyo_validate_workflow` and repair every returned issue. Treat its normalized bundle as canonical.
5. Present the workflow and test intent to the user. Obtain explicit approval before calling `tokyo_import_workflow` or `tokyo_run_workflow`.
6. Use a stable idempotency key for retries of the same import or run. Use a new key only when intentionally creating a new workflow or execution.
7. Poll `tokyo_get_run` until the run is terminal. On failure, call `tokyo_get_run_diagnostics`, revise the smallest relevant part, validate, and request approval before rerunning.

## Guardrails

- Keep passwords, registry tokens, authorization headers, cookies, and private keys out of workflow JSON. Use deployment-side secret configuration.
- Use container ports, not host-published ports, for service-to-service tests.
- Set readiness according to startup requirements; relation describes architecture and does not by itself create a startup dependency.
- Target services by their sanitized labels as reported by validation.
- Do not invent endpoints, credentials, topics, schemas, or expected values. Derive them from repository evidence or ask the user.
- Prefer a small smoke scenario first, then add stateful assertions that prove infrastructure integration.

If MCP is unavailable, still create `workflow.json` and clearly state that authoritative validation and execution remain pending.
