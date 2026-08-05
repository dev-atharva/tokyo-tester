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
- browser journeys for user-visible UI entrypoints when repository evidence identifies a provisioned UI service and stable accessible locators

## Test patterns

- HTTP: assert status plus stable response body fragment or JSON partial.
- Database/document/cache/queue: pair an app action with a direct infra assertion.
- Shell: use for runtime interpolation or checks not covered by specialized tests.
- Delay: use only for externally asynchronous transitions; prefer readiness or deterministic polling endpoints.

## Ordering

Put every test id exactly once in `testOrder`. Use `dependsOnTestIds` for true data/control dependencies, not just visual grouping.

For a browser journey, put every step id exactly once in `stepOrder`. Keep actions and assertions sequential. Assert navigation with URL/path when the outcome is a page transition; assert a visible accessible locator when the outcome stays on the current page.
