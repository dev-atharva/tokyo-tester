# Tokyo Tester

Tokyo Tester describes executable journeys through a provisioned system and the evidence those journeys produce.

## Language

**Browser journey**:
A scenario in which a managed browser interacts with a web application in the workflow as a user would.
_Avoid_: Browser test, UI test

**Environment driver**:
A runtime participant outside the system under test that performs scenario actions and gathers observations through an external interface.
_Avoid_: Input service, test service

**Journey scenario**:
A scenario expressed as an environment driver and an ordered sequence of action, assertion, or control steps.
_Avoid_: Step test, scripted test

**Legacy test scenario**:
A compatibility scenario expressed through Tokyo Tester's original typed tests and test order.
_Avoid_: Journey, migrated scenario

**Managed browser**:
A browser execution environment owned and isolated by Tokyo Tester for the duration of a workflow run.
_Avoid_: Local browser, operator browser

**Browser session**:
The isolated browsing state shared by all steps of one browser journey, including its page, cookies, local storage, and authentication state.
_Avoid_: Browser instance, tab

**Scenario step**:
One dependency-aware unit of behavior or verification within a scenario. A scenario step is an action, assertion, or control.
_Avoid_: Test

**Action**:
A scenario step that deliberately stimulates the system under test.
_Avoid_: Input, command

**Assertion**:
A scenario step that evaluates observable evidence against an expected condition.
_Avoid_: Check, validation

**Control**:
A scenario step that coordinates execution without stimulating or asserting system behavior.
_Avoid_: Utility test, helper test

**Run secret**:
A sensitive value bound to one workflow run at submission and excluded from durable workflow definitions, revisions, exports, and execution evidence. Within a workflow run, one secret-reference name identifies one value shared by every selected scenario that references it.
_Avoid_: Workflow secret, stored credential

**Session secret**:
A sensitive value supplied by a human and retained only for one workflow during the current human-facing Tokyo Tester session so it may supply multiple workflow runs.
_Avoid_: Browser-session secret, persisted secret

**Run intent**:
A short-lived, secret-free request to execute an exact workflow selection that becomes a workflow run only after an authorized human resolves required session secrets and approves it.
_Avoid_: Pending run, draft run

**Journey result**:
The aggregate ordered outcome of one journey scenario, containing one step result for every scenario step plus permitted execution evidence. Its outcome is passed, failed, or interrupted; cancellation and cleanup are execution-lifecycle states rather than journey outcomes.
_Avoid_: Test result, browser report

**Step result**:
The outcome of one scenario step within a journey result. A step result is passed, failed, skipped, or interrupted and is never an independent legacy test result.
_Avoid_: Test result, step test

**Evidence artifact**:
A bounded retained file that helps explain a journey result and is accessed through an opaque reference governed by the workflow run's authorization and retention.
_Avoid_: Raw executor file, public artifact

**Skipped step**:
A scenario step that was not attempted because an earlier step failed or the journey was interrupted.
_Avoid_: Passed step, missing result

**Interrupted journey**:
A journey whose authoritative outcome was lost after one or more effects may have begun. It is not resumed or replayed automatically.
_Avoid_: Failed assertion, retryable journey
