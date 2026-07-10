---
name: tokyo-tester
description: Inspect one or more application repositories, model their services and infrastructure as a Tokyo Tester workflow, design detailed scenarios, validate or import through the Tokyo Tester MCP server, run scenarios, and repair failures from diagnostics. Use when integrating a project with Tokyo Tester or creating HTTP, database, document, cache, queue, shell, or delay tests.
---

# Tokyo Tester

Build workflows from repository evidence, then use Tokyo Tester as the authoritative validator and executor. The MCP server must receive only compact summaries, never source files or secrets.

## Workflow

1. Discover every relevant repository before drafting. If there are multiple repos, map each repo to its service(s); if repo boundaries are unclear, ask targeted questions.
2. Inspect each service repo for build/image evidence, ports, commands, health/readiness, env/config, migrations, caches, queues/topics, API routes/OpenAPI, and existing tests. Use [references/research.md](references/research.md).
3. Model services, infrastructure, runtime references, and readiness from evidence. Use [references/graph-modeling.md](references/graph-modeling.md).
4. Design a scenario matrix that proves user-visible flows and infrastructure effects, not just smoke checks. Use [references/scenario-design.md](references/scenario-design.md).
5. Call `tokyo_list_projects` and inspect `allowedActions` before choosing a path.
   - With `edit`, call `tokyo_get_capabilities`, read [references/authoring.md](references/authoring.md), author a bundle, and validate it with `tokyo_validate_workflow`.
   - Without `edit`, never attempt to import or modify workflows. Call `tokyo_list_workflows`, then `tokyo_get_workflow` to present the existing scenarios the user can run.
6. Before authoring or importing complex workflows, call `tokyo_review_workflow_plan` with compact summaries: repositories, service inventory, dependency map, scenario matrix, evidence notes, and open questions. Treat warnings as repair guidance.
7. Present the workflow and scenario selection to the user. Obtain explicit approval before any import or execution.
8. Editors may call `tokyo_import_workflow` or `tokyo_run_workflow`. Runners call `tokyo_run_existing_workflow`, passing selected scenario IDs; omit `scenarioIds` only when the user approves running all scenarios.
9. Use a stable idempotency key for retries of the same import or run. Use a new key only when intentionally creating a new workflow or execution.
10. Poll `tokyo_get_run` until terminal. On failure, call `tokyo_get_run_diagnostics`; editors may revise the smallest relevant part, validate, and request approval before rerunning.

## Guardrails

- Keep passwords, registry tokens, authorization headers, cookies, and private keys out of workflow JSON. Use deployment-side secret configuration.
- Do not send source files, raw manifests, logs, or large schemas to MCP. Summarize evidence and cite local file paths in your own response when useful.
- Use container ports, not host-published ports, for service-to-service tests.
- Set readiness according to startup requirements; relation describes architecture and does not by itself create a startup dependency.
- Target services by their sanitized labels as reported by validation.
- Do not invent endpoints, credentials, topics, schemas, or expected values. Derive them from repository evidence or ask the user.
- Prefer a small smoke scenario first, then add stateful assertions that prove infrastructure integration.
- Use [references/quality-rubric.md](references/quality-rubric.md) before asking to import or run.

If MCP is unavailable, still create `workflow.json` and clearly state that authoritative validation and execution remain pending.
