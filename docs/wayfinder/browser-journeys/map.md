---
id: browser-journeys
title: Make environment-driven browser journeys a first-class Tokyo Tester workflow
status: open
labels:
  - wayfinder:map
---

## Destination

Produce an implementation-ready architecture and product specification, then deliver a verified first vertical slice in which one runner-managed headless Chromium browser per scenario executes a versioned sequence of browser actions and assertions against one workflow service, while workflow-bundle v2 remains compatible and the UI, MCP server, and Tokyo Tester skill can all author and understand the journey.

## Notes

- This effort explicitly carries execution through the first vertical slice; implementation tickets belong on this map.
- Use the language in [Tokyo Tester domain context](../../../CONTEXT.md) and update it as terms resolve.
- Consult `domain-modeling` and `codebase-design` for architecture decisions; `frontend-design` for UI prototypes and implementation; `golang-backend-development` and `testcontainers-go` for runner work; `mcp-best-practices` and `tokyo-tester` for the agent path.
- The browser is an environment driver configured in the scenario editor, not a service-graph node.
- The first slice has one browser card, browser session, page, target service, and container port per scenario. Steps are sequential and fail fast.
- Initial actions cover navigation, accessibility-first form filling, and clicking. Initial assertions cover retrying URL/path matching and visible elements or text.
- The managed runtime is pinned headless Chromium. Broader engines, locators, multiple users, and multiple UI targets remain beyond this slice.
- Success retains structured step results, timing, and final URL. A non-secret failure additionally retains a screenshot, Playwright trace, current URL, and redacted error under normal run retention. Resolving any run secret suppresses both screenshots and traces.
- Durable definitions may contain non-sensitive literals and run-secret references. Only a human supplies run-secret values; AI clients never receive or submit them.
- Completion includes passing and deliberately failing sample journeys, contract/runner/UI/end-to-end coverage, unchanged v2 behavior, MCP capability/validation/import/run/diagnostic support, and an updated packaged Tokyo Tester skill.

## Decisions so far

- [Verify the managed-browser runtime topology](tickets/001-verify-managed-browser-runtime-topology.md) — Use one digest-pinned, per-scenario Node/Playwright/Chromium executor on the workflow network with attached I/O, runner-owned limits and cleanup, and no trace persistence for secret-bearing journeys without proven sanitization.
- [Define the versioned scenario-step contract and v2 compatibility](tickets/002-define-v3-step-contract-and-v2-compatibility.md) — V3 explicitly supports lossless `legacy-tests` scenarios beside typed environment-driven `journey` scenarios, with browser as the first driver and unchanged v2 execution.
- [Implement the v3 contract, validation, and v2 normalization](tickets/007-implement-v3-contract-and-normalization.md) — The published v3 schema, runner/UI normalization, explicit durable scenario fields, revision snapshots, run submissions, capabilities, MCP authoring schema, and packaged skill now understand legacy and browser journey scenarios; execution is deliberately gated until the managed-browser slice.
- [Prototype the isolated browser-executor lifecycle](tickets/014-prototype-isolated-browser-executor.md) — The hardened per-scenario executor lifecycle, bounded attached protocol, workflow-network access, allow-listed artifact streaming, secret trace suppression, cancellation, and janitor recovery work on Docker Desktop; Chromium sandbox enablement plus runner-in-Compose and production Linux validation remain release gates.
- [Design the browser-execution module and adapter seam](tickets/003-design-browser-execution-module.md) — Use one browser-specific deep module with a single execute operation, private Node/Docker and artifact/progress adapters, complete ordered results, typed infrastructure errors, and no automatic replay or mid-journey resume after execution may begin.
- [Prototype the Environment browser-journey editor](tickets/004-prototype-environment-browser-editor.md) — Use the validated Hybrid workbench: a compact Environment-first browser target, horizontal sequence overview, and persistent ordered outline beside a focused step inspector.
- [Design human-only run-secret resolution across UI, runner, and MCP](tickets/005-design-human-only-run-secret-resolution.md) — Use masked per-workflow session reuse behind explicit human authorization, single-use 15-minute MCP handoffs, encrypted run-scoped delivery, terminal cleanup, and defense-in-depth redaction without exposing values to AI clients.
- [Define browser step results and failure evidence](tickets/006-define-browser-results-and-evidence.md) — Persist one aggregate ordered journey result, keep v2 test metrics separate, retain bounded non-secret failure artifacts through opaque 30-day references, suppress all visual artifacts for secret-bearing journeys, and give MCP on-demand access only to non-secret screenshots.
- [Implement managed Chromium journey execution](tickets/008-implement-managed-browser-execution.md) — The durable runner now executes one hardened browser on the workflow network, persists fail-fast aggregate results and bounded authorized evidence, suppresses secret-bearing artifacts, cleans on cancellation, and requires production Linux sandbox proof before release.
- [Implement browser run-secret resolution and redaction](tickets/009-implement-run-secret-resolution.md) — Authenticated humans now authorize exact persisted selections through a masked memory-only session vault, while the runner enforces exact secret sets, encrypted run-scoped delivery, per-scenario subsets, terminal cleanup, artifact suppression, and defense-in-depth redaction.
- [Implement the Environment browser-journey editor and results UI](tickets/010-implement-browser-journey-editor.md) — The accepted Environment-first hybrid editor now authors validated accessibility-first journeys, the human run path executes their synchronized definitions, and the run screen separates aggregate journey and nested step outcomes with sanitized diagnostics and authenticated evidence controls.
- [Extend MCP and the Tokyo Tester skill for browser journeys](tickets/011-extend-mcp-and-agent-skill.md) — MCP now preserves exact normalized authoring and v2 compatibility, uses secret-free single-use 15-minute human run intents, returns compact browser diagnostics, and exposes only explicitly requested non-secret PNG screenshots while traces remain UI-only; the packaged skill teaches the same boundary and repair loop.

## Not yet specified

- How environment drivers generalize beyond browsers to mobile, serverless invocation, schedulers, and batch processes after this slice.
- How multiple managed browsers, independent users, tabs, parallel branches, or journeys spanning multiple configured UI targets compose.
- Which additional browser engines, locator strategies, actions, assertions, and evidence modes graduate after the initial capability set.
- Whether externally hosted applications, remote browser providers, or host browsers ever join the same execution model.
- How environment actors should eventually appear alongside the system graph beyond the initial scenario-editor Environment section.

## Out of scope

- Mobile-device or emulator execution, serverless/cloud invocation, scheduled jobs, and batch-process drivers.
- Firefox, WebKit, headed debugging, remote browser providers, and cross-browser matrices.
- Multiple browser cards or users per scenario, parallel browser steps, multiple pages, and cross-target journeys.
- Raw CSS or XPath locators, video retention, full-page HTML retention, cookie/local-storage capture, and unconditional success traces.
- Testing externally deployed websites or services outside the provisioned workflow network.
