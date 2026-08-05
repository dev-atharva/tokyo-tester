---
id: browser-journeys-006
title: Define browser step results and failure evidence
status: closed
parent: ../map.md
labels:
  - wayfinder:grilling
assignee: primary-agent
blocked_by:
  - browser-journeys-001
  - browser-journeys-002
resolution: ../resolutions/006-define-browser-results-and-evidence.md
---

## Question

What result, diagnostic, artifact-reference, retention, redaction, and skipped-step contract lets the runner, durable store, run UI, and MCP diagnostics represent successful and failed browser journeys consistently with existing executions? Resolve the research finding that Playwright traces cannot be comprehensively scrubbed: secret-bearing journeys must suppress traces unless an audited sanitization pipeline is proven.
