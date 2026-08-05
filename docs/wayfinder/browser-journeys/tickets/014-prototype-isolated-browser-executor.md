---
id: browser-journeys-014
title: Prototype the isolated browser-executor lifecycle
status: closed
parent: ../map.md
labels:
  - wayfinder:prototype
assignee: primary-agent
blocked_by:
  - browser-journeys-001
  - browser-journeys-002
resolution: ../resolutions/014-prototype-isolated-browser-executor.md
---

## Question

Can a minimal digest-pinned Node/Playwright/Chromium executor, controlled by the current Go runner through attached stdin and bounded NDJSON stdout, reliably run on the existing workflow network with private IPC and bounded shared memory, copy artifacts before termination, honor cancellation and resource limits, and leave ownership-labelled resources that the janitor cleans after runner failure across supported development and production Docker modes?
