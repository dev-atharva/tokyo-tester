---
id: browser-journeys-003
title: Design the browser-execution module and adapter seam
status: closed
parent: ../map.md
labels:
  - wayfinder:grilling
assignee: primary-agent
blocked_by:
  - browser-journeys-001
  - browser-journeys-002
  - browser-journeys-014
resolution: ../resolutions/003-design-browser-execution-module.md
---

## Question

What deep module interface should accept a normalized browser journey and runtime dependencies, hide Chromium and Playwright lifecycle details behind an adapter seam, enforce sequential shared-session and fail-fast semantics, and return complete structured step results without leaking implementation details into callers?
