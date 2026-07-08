# Scenario and test design

Design scenarios from user-visible flows and infrastructure effects. A complex service graph needs more than one smoke check.

## Scenario matrix

Create a compact matrix before authoring:

```text
scenario | purpose | entrypoint | services touched | infra assertions | evidence | gaps
```

Include:

- one fast readiness/smoke scenario
- at least one happy path that crosses service boundaries
- negative or validation paths when the repo exposes stable behavior
- async completion checks for queues/workers
- direct database/document/cache/queue assertions for important side effects

## Test patterns

- HTTP: assert status plus stable response body fragment or JSON partial.
- Database/document/cache/queue: pair an app action with a direct infra assertion.
- Shell: use for runtime interpolation or checks not covered by specialized tests.
- Delay: use only for externally asynchronous transitions; prefer readiness or deterministic polling endpoints.

## Ordering

Put every test id exactly once in `testOrder`. Use `dependsOnTestIds` for true data/control dependencies, not just visual grouping.
