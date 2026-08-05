---
ticket: ../tickets/010-implement-browser-journey-editor.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Implemented the accepted hybrid browser-journey workbench inside the existing
scenario editor. A scenario can now switch explicitly between infrastructure
tests and a browser journey. Journey mode starts with the Environment target,
derives eligible workflow services and container ports, keeps a horizontal
sequence plus persistent ordered outline, and opens one focused step inspector.
The first slice authors navigation, form filling, clicks, URL matching, visible
element assertions, and bounded waits. Locator controls prefer accessible role,
label, visible text, and test ID strategies; fill values distinguish durable
non-sensitive literals from reference-only run secrets. Field-level and
journey-level validation feeds both authoring feedback and the run gate.

Integrated journey definitions into the real execution path instead of the
legacy test validator. The run screen now treats the aggregate journey as one
authoritative result, presents scenario outcome separately from cleanup or
interruption, renders every browser step in order with passed, failed, skipped,
or interrupted status, and keeps journey counters separate from nested step
counters and legacy test metrics. Sanitized final location, compact step
diagnostics, evidence availability or suppression, and authenticated
same-origin screenshot and trace controls are shown only when the runner
returned an authorized opaque artifact reference. The human run-intent page
binds its memory-only vault to the intent's project and workflow while exposing
only reference names and terminal-safe status.

Live execution exposed three integration gaps that are now covered by
regressions. Human authorization accepts forward-compatible React Flow
presentation metadata while still decoding into the runner's narrow request
model. Reloaded persisted scenarios normalize inactive empty collections to
the v3 contract's absent fields. Rapid edits to one scenario coalesce into its
latest payload while retaining the original optimistic-concurrency base, so a
freshly authored ordered journey reaches the runner before execution.

Visual verification used the actual application, local MySQL sync, host runner,
managed Chromium executor, and an Nginx workflow service. The deliberately
failing two-step journey produced one passed navigation and one failed
accessibility assertion, completed cleanup, retained sanitized `/` location,
reported one journey and two nested steps, exposed screenshot and trace
controls, and rendered the matching service-scoped diagnostic and structured
activity events. Verification also passed 119 database-independent UI,
workflow, and sync tests; the production Next.js build; the complete Go test
suite; `go vet ./...`; focused authorization and normalization regressions;
TypeScript; targeted Biome checks; and `git diff --check`.
