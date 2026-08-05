---
id: browser-journeys-011
title: Extend MCP and the Tokyo Tester skill for browser journeys
status: closed
parent: ../map.md
labels:
  - wayfinder:task
assignee: mcp-skill-agent
resolution: ../resolutions/011-extend-mcp-and-agent-skill.md
blocked_by:
  - browser-journeys-005
  - browser-journeys-006
  - browser-journeys-007
---

## Question

Implement and verify agent discovery, plan review, v3 validation, exact
normalized import and execution, the secret-free 15-minute run-intent handoff
and status polling contract, browser diagnostics, and backward-compatible v2
behavior in the MCP tools, including compact aggregate journey diagnostics and
an explicitly requested, read-only non-secret screenshot operation while traces
remain UI-only. Then update and package the Tokyo Tester skill so an
AI can evidence and author browser journeys without receiving source files,
secret values, or human session-vault availability through MCP.
