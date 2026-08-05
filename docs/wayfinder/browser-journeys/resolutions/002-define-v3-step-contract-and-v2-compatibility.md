---
ticket: ../tickets/002-define-v3-step-contract-and-v2-compatibility.md
resolved_at: 2026-08-02
resolved_by: primary-agent
---

## Resolution comment

Workflow-bundle v3 gives each scenario an explicit `executionModel`: `legacy-tests` retains the complete v2 tests and test order, while `journey` contains one typed environment driver and an ordered sequence of action, assertion, or control steps. A v3 workflow may contain both models.

The first journey driver is browser, targeting one existing workflow service and container port. It supports sequential navigate, accessibility-first fill and click actions; retrying URL/path and visibility assertions; bounded delay controls; durable literals and human-resolved run-secret references; strict fail-fast execution; and no Playwright- or Chromium-specific bundle fields.

V1 and v2 remain accepted. They normalize losslessly through the legacy adapter without serialized rewrites, synthetic step splitting, or changes to IDs, ordering, dependencies, retry, result, resume, and diagnostic behavior. Workflows containing only unchanged legacy scenarios may continue exporting v2; any workflow containing a journey exports v3.

The accepted serialized contract, validation semantics, normalization seam, persistence expectations, and MCP/skill obligations are recorded in [Workflow-bundle v3 scenario-step model](../../../architecture/workflow-bundle-v3-step-model.md).
