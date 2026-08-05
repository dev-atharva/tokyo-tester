# Keep browser journey execution behind a browser-specific module

Tokyo Tester will execute a normalized browser journey through one browser-specific deep module whose external interface is a single `Execute(context.Context, Request) (Result, error)` call. The module owns sequential shared-session execution, fail-fast behavior, protocol validation, redaction, evidence collection, cancellation, and managed-browser cleanup behind private Node/Docker and local artifact/progress adapter seams. This keeps the existing legacy-test execution path intact and avoids paying for a generic environment-driver registry before a second driver exists.

## Considered options

- A generic journey-driver registry would make later mobile, serverless, or batch drivers pluggable immediately, but introduces a driver union, isolation abstraction, policy matrix, and layered adapter hierarchy for a single current implementation.
- Public start, execute-step, collect-artifacts, and stop methods would allow more lifecycle control, but create a shallow module by making every caller preserve ordering, cleanup, and error invariants.
- A browser-specific single-call module keeps those invariants local. A common environment-driver abstraction may be extracted when a second concrete driver proves the shared seam.

## Consequences

- The workflow runner provisions and cleans the system under test; the browser module owns only its managed-browser executor.
- Runner policy, including image digest, Chromium sandbox requirement, limits, evidence caps, and trace suppression, is constructor configuration and never workflow input.
- A browser journey is one resumability unit. Step progress may be persisted, but an interrupted journey is never resumed from the middle or automatically replayed after a step may have started.
