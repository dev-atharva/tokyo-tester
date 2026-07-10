# Quality rubric and repair loop

Use this rubric before import or execution. Warnings do not replace `tokyo_validate_workflow`.

## Strong workflow signals

- Every application service has repo provenance, image/build evidence, port or command evidence, and readiness evidence.
- Every runtime dependency has an edge and readiness that makes `${service.host}` references reachable.
- Important infrastructure nodes are tested directly or through a paired application action plus infra assertion.
- Scenario names describe behavior, not implementation steps.
- Open questions are explicit and blocked assumptions are not silently encoded in workflow JSON.

## Weak workflow signals

- Many services but only one smoke scenario.
- Generic services without build/image evidence.
- Untested databases, caches, queues, or workers.
- Assertions based on guessed endpoints, topics, table names, credentials, or response bodies.
- Large raw files or secrets sent to MCP.

## Repair loop

1. Run `tokyo_review_workflow_plan` for advisory warnings.
2. Fix missing evidence or ask targeted questions.
3. Validate the bundle with `tokyo_validate_workflow`.
4. Edit only the smallest relevant part for validation errors.
5. Request approval before import or run.
