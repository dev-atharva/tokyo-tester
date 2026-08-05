---
ticket: ../tickets/003-design-browser-execution-module.md
resolved_at: 2026-08-03
resolved_by: primary-agent
---

## Resolution comment

Use one browser-specific deep module at `runner-v2/pkg/browserjourney` with a single external operation: `Executor.Execute(context.Context, Request) (Result, error)`. The request contains one normalized browser journey, an opaque attachment to the provisioned workflow environment, and memory-only resolved run secrets. Runner policy, Node/Playwright protocol, Docker lifecycle, browser/session/page ownership, sequential fail-fast execution, redaction, bounded evidence streaming, cancellation, and executor cleanup remain behind the seam.

Expected action or assertion failure is a failed journey result, not a Go error. Infrastructure, protocol, evidence, cancellation, and cleanup failures return a typed error alongside accepted partial results; the module synthesizes the skipped suffix so every result retains journey order. Any secret-bearing journey suppresses traces. A browser journey is one resumability unit: after a step may have started, the durable worker neither replays it automatically nor resumes from a step checkpoint.

Keep the existing legacy-test registry, retry, checkpoint, result, and diagnostic path unchanged. Do not introduce a generic environment-driver registry until a second concrete driver demonstrates the shared seam. The detailed interface, invariants, adapter strategy, error semantics, and verification surface are recorded in [Browser journey execution module](../../../architecture/browser-journey-execution-module.md), with the architectural trade-off captured by [ADR 0001](../../../adr/0001-browser-specific-journey-execution-module.md).
