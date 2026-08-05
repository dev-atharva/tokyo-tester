---
id: browser-journeys-009
title: Implement browser run-secret resolution and redaction
status: closed
parent: ../map.md
labels:
  - wayfinder:task
assignee: primary-agent
resolution: ../resolutions/009-implement-run-secret-resolution.md
blocked_by:
  - browser-journeys-005
  - browser-journeys-007
---

## Question

Implement and verify exact reference derivation, the per-workflow memory-only
session vault with automatic masked reuse, the shared human authorization
endpoint, missing-or-extra-secret blocking, encrypted runner delivery,
run-scoped in-memory handling, terminal cleanup, export and revision exclusion,
and diagnostic redaction, including suppression of every screenshot and trace
for a secret-bearing journey, according to the resolved security design. MCP run
intent schemas and polling remain part of the dedicated MCP and skill ticket.
