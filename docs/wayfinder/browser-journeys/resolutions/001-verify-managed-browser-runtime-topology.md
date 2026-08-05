---
ticket: ../tickets/001-verify-managed-browser-runtime-topology.md
resolved_at: 2026-08-02
resolved_by: research-browser-runtime-agent
---

## Resolution comment

Adopt one digest-pinned, short-lived Node/Playwright/Chromium executor container per browser scenario. Attach it only to the workflow network, expose no browser control port, send one normalized journey through attached stdin, receive bounded NDJSON progress through stdout, copy permitted artifacts before termination, and apply runner-owned resource limits, ownership labels, deadlines, and cleanup.

Do not install browser binaries or an unofficial Playwright client in the Go runner. Private shared-memory stability, hostile-page isolation, and evidence handling for secret-bearing journeys remain explicit release gates. In particular, Playwright does not provide comprehensive trace-secret scrubbing, so traces must be suppressed whenever a run secret is resolved unless a separately audited sanitization pipeline is proven.

Full primary-source findings: [Managed-browser runtime topology](../../../research/browser-runtime-topology.md).
