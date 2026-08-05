---
id: browser-journeys-001
title: Verify the managed-browser runtime topology
status: closed
parent: ../map.md
labels:
  - wayfinder:research
assignee: research-browser-runtime-agent
blocked_by: []
research_branch: research/browser-runtime-topology
research_artifact: docs/research/browser-runtime-topology.md
resolution: ../resolutions/001-verify-managed-browser-runtime-topology.md
---

## Question

Against official Playwright, Docker, and Testcontainers documentation and source, what supported topology should let the Go runner provision a pinned headless Chromium runtime inside the workflow network, control it reliably, collect traces and screenshots, enforce resource limits, and clean it up without baking browser binaries into the runner?
