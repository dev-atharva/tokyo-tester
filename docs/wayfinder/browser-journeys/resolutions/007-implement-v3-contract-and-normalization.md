---
ticket: ../tickets/007-implement-v3-contract-and-normalization.md
resolved_at: 2026-08-02
resolved_by: primary-agent
---

## Resolution comment

Implemented workflow-bundle v3 as a strict scenario union while preserving v1/v2 behavior. V1 upgrades to v2, v2 remains serialized as v2 and normalizes in memory to `legacy-tests`, and v3 requires each scenario to declare `legacy-tests` or `journey`. Browser journeys target one provisioned service/container port and support sequential navigate, fill, click, URL, visible, and delay steps with accessibility-first locators and literal or human-resolved `secretRef` values.

Published `contracts/workflow-bundle-v3.schema.json`; added strict Go decoding, validation, translation plans, UI import/export and fresh step IDs; persisted explicit execution-model, environment, step, and order fields through MySQL/PostgreSQL migrations and sync; retained them in execution revisions; and prevented valid journeys from being reported as successful zero-test runs before the browser executor exists.

Capability discovery and MCP tool schemas now advertise v2/v3 and strict browser authoring, and the packaged Tokyo Tester skill explains browser journeys and the human-only runtime-secret boundary. This prepares but does not close the later MCP ticket: missing-secret run requirements and browser execution diagnostics still depend on the secret, evidence, and executor slices.

Verification: full `go test ./...` passed, UI TypeScript checking passed, and 135 UI tests passed. Four unrelated UI database integration tests require the absent MySQL service at `127.0.0.1:33306`; one of those files also exposes Bun's existing nested-test limitation.
