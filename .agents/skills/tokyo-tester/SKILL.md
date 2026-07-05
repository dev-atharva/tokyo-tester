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
2. Call `tokyo_list_projects` and inspect `allowedActions` before choosing a path.
   - With `edit`, call `tokyo_get_capabilities`, read [references/authoring.md](references/authoring.md), author a bundle, and validate it with `tokyo_validate_workflow`.
   - Without `edit`, never attempt to import or modify workflows. Call `tokyo_list_workflows`, then `tokyo_get_workflow` to present the existing scenarios the user can run.
3. Present the workflow and scenario selection to the user. Obtain explicit approval before any import or execution.
4. Editors may call `tokyo_import_workflow` or `tokyo_run_workflow`. Runners call `tokyo_run_existing_workflow`, passing selected scenario IDs; omit `scenarioIds` only when the user approves running all scenarios.
5. Use a stable idempotency key for retries of the same import or run. Use a new key only when intentionally creating a new workflow or execution.
6. Poll `tokyo_get_run` until the run is terminal. On failure, call `tokyo_get_run_diagnostics`. Editors may revise the smallest relevant part, validate, and request approval before rerunning; runners should report diagnostics without attempting modifications.

## Guardrails

- Keep passwords, registry tokens, authorization headers, cookies, and private keys out of workflow JSON. Use deployment-side secret configuration.
- Use container ports, not host-published ports, for service-to-service tests.
- Set readiness according to startup requirements; relation describes architecture and does not by itself create a startup dependency.
- Target services by their sanitized labels as reported by validation.
- Do not invent endpoints, credentials, topics, schemas, or expected values. Derive them from repository evidence or ask the user.
- Prefer a small smoke scenario first, then add stateful assertions that prove infrastructure integration.

If MCP is unavailable, still create `workflow.json` and clearly state that authoritative validation and execution remain pending.
