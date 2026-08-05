---
ticket: ../tickets/006-define-browser-results-and-evidence.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Persist one versioned aggregate journey result on each journey scenario run,
with one ordered passed, failed, skipped, or interrupted step result for every
definition step. Journey outcomes are passed, failed, or interrupted;
cancellation and cleanup remain separate execution states. Realtime journey and
step activities are best-effort progress, while the terminal scenario snapshot
and `journeyresult` event carry the authoritative aggregate. Browser steps never
become legacy test-result rows, and workflow summaries add separate journey and
step counters without changing v2 test counters.

Non-secret failures attempt a bounded PNG screenshot and Playwright trace.
Resolving any run secret suppresses both artifacts because neither locator
masking nor trace redaction can prove that an application did not disclose a
secret elsewhere. Evidence capture is best-effort: failures and limits produce
secondary diagnostics without erasing the primary behavior outcome. Durable
location evidence includes only a redacted relative path and query-key names.

Artifacts use opaque authenticated references, the existing 30-day event
retention, and a runner-owned persistent directory backed by a Compose volume,
Kubernetes PVC, or configured host path. Initial maxima are 256 KiB manifest,
4 MiB screenshot, 25 MiB trace, 32 MiB retained total, and 40 MiB executor
tmpfs. MCP receives compact structured diagnostics and may fetch a non-secret
screenshot on demand; traces remain human-facing UI downloads. The complete
contract is recorded in [Browser journey results and failure evidence](../../../architecture/browser-journey-results-and-evidence.md).
