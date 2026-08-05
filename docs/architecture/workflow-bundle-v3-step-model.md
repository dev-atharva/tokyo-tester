# Workflow-bundle v3 scenario-step model

Status: accepted for the first browser-journey vertical slice on 2026-08-02.

## Decision

Workflow-bundle v3 keeps the workflow service graph unchanged and gives every scenario an explicit `executionModel`:

- `legacy-tests` preserves the existing `tests` and `testOrder` representation and execution behavior.
- `journey` describes an environment driver and an ordered sequence of action, assertion, or control steps.

The first journey driver is `browser`. The serialized contract names Tokyo Tester concepts and browser behavior; it does not expose Playwright, Docker, Chromium flags, image references, or runner resource settings.

## Why the two models coexist

Existing HTTP, database, document, cache, queue, and shell tests can combine a stimulus and an expectation in one executor result. Automatically splitting them into synthetic actions and assertions would change result identity, retry behavior, failure reporting, and resume semantics.

The explicit compatibility model is a strangler seam:

- v1 and v2 bundles keep their current behavior;
- a v3 workflow may contain legacy test scenarios and journey scenarios together;
- new environment drivers join `journey` without changing the service graph;
- existing capabilities may migrate into native steps later through separate decisions.

## Representative v3 bundle

```json
{
  "schemaVersion": 3,
  "kind": "cots.workflow-bundle",
  "workflow": {
    "name": "Storefront",
    "nodes": [],
    "edges": []
  },
  "scenarios": [
    {
      "name": "API remains healthy",
      "executionModel": "legacy-tests",
      "tests": [
        {
          "id": "health",
          "name": "Check API health",
          "type": "http",
          "targetServices": ["api"],
          "httpConfig": {
            "method": "GET",
            "path": "/health",
            "port": "8080",
            "expectedStatus": 200
          }
        }
      ],
      "testOrder": ["health"]
    },
    {
      "name": "Customer signs in",
      "executionModel": "journey",
      "environment": {
        "driver": "browser",
        "browser": {
          "targetService": "storefront_web",
          "targetPort": "3000"
        }
      },
      "steps": [
        {
          "id": "open-login",
          "name": "Open the login page",
          "kind": "action",
          "action": {
            "operation": "navigate",
            "path": "/login"
          }
        },
        {
          "id": "enter-email",
          "name": "Enter the email address",
          "kind": "action",
          "action": {
            "operation": "fill",
            "locator": {
              "strategy": "label",
              "value": "Email"
            },
            "value": {
              "source": "literal",
              "value": "test-user@example.com"
            }
          }
        },
        {
          "id": "enter-password",
          "name": "Enter the password",
          "kind": "action",
          "action": {
            "operation": "fill",
            "locator": {
              "strategy": "label",
              "value": "Password"
            },
            "value": {
              "source": "run-secret",
              "secretRef": "LOGIN_PASSWORD"
            }
          }
        },
        {
          "id": "submit-login",
          "name": "Submit the login form",
          "kind": "action",
          "action": {
            "operation": "click",
            "locator": {
              "strategy": "role",
              "role": "button",
              "name": "Sign in"
            }
          }
        },
        {
          "id": "dashboard-url",
          "name": "Reach the dashboard",
          "kind": "assertion",
          "timeoutMs": 10000,
          "assertion": {
            "operation": "url",
            "path": "/dashboard"
          }
        },
        {
          "id": "dashboard-heading",
          "name": "Show the dashboard heading",
          "kind": "assertion",
          "assertion": {
            "operation": "visible",
            "locator": {
              "strategy": "role",
              "role": "heading",
              "name": "Dashboard"
            }
          }
        }
      ],
      "stepOrder": [
        "open-login",
        "enter-email",
        "enter-password",
        "submit-login",
        "dashboard-url",
        "dashboard-heading"
      ]
    }
  ]
}
```

The empty `nodes` array above is abbreviated for readability; normal workflow graph validation still requires at least one valid service node.

## Scenario contract

All v3 scenarios require:

- `name`: non-empty and unique within the bundle;
- optional `description`;
- `executionModel`: `legacy-tests` or `journey`.

An `executionModel: legacy-tests` scenario requires `tests` and `testOrder` with the complete v2 test contract. It must not contain `environment`, `steps`, or `stepOrder`.

An `executionModel: journey` scenario requires `environment`, `steps`, and `stepOrder`. It must not contain `tests` or `testOrder`.

This explicit discriminator is required in v3 even when the other fields would allow inference. It makes validation errors clearer for people and AI clients and avoids ambiguous partial scenarios.

## Browser environment

The first journey environment is:

```json
{
  "driver": "browser",
  "browser": {
    "targetService": "storefront_web",
    "targetPort": "3000"
  }
}
```

Rules:

- `targetService` references the sanitized name of an existing workflow service.
- `targetPort` references one of that service's configured container ports. A host port is neither required nor used.
- A navigation action supplies the initial path; the environment has no competing `initialPath` field.
- Browser engine, headed mode, image, sandbox, resource, network, and trace settings are runner policy and are absent from the bundle.
- Exactly one browser session and page serve the whole journey in the first slice.

## Step contract

Every step has:

- a unique, non-empty `id`;
- a non-empty `name`;
- `kind`: `action`, `assertion`, or `control`;
- optional `timeoutMs`, bounded by limits published through capabilities and enforced by the runner;
- exactly one matching configuration object: `action`, `assertion`, or `control`.

`stepOrder` contains every step id exactly once. It is the execution and control-dependency order for the first slice. Steps run sequentially in one browser session. Parallel branches and explicit dependency graphs are intentionally deferred.

The first failure stops execution. The failing step is failed, every later step is skipped, the scenario is failed, and workflow cleanup still runs. Generic action retries are absent because replaying clicks or form submissions may duplicate effects. Locator actionability and assertions may wait until their step timeout.

### Browser actions

The initial action operations are:

- `navigate`: requires an origin-relative `path` beginning with `/`;
- `fill`: requires a locator and value source;
- `click`: requires a locator.

No operation accepts a full external URL in the first slice.

### Browser assertions

The initial assertion operations are:

- `url`: requires an exact expected path; optional query entries are matched as a subset, while origin and fragment are ignored;
- `visible`: requires a locator and passes when the located element becomes visible before timeout.

Both assertions retry until their timeout. A visible-text assertion uses a `text` locator rather than a separate assertion operation.

### Controls

The initial control operation is a bounded `delay` with `durationMs`. It exists for exceptional externally asynchronous behavior; URL and visibility assertions should normally provide deterministic waiting.

## Accessibility-first locators

A locator has `strategy` and strategy-specific fields:

- `role`: requires `role` and accessible `name`;
- `label`: requires `value`;
- `text`: requires `value`;
- `testId`: requires `value`.

Role, label, and text locators may carry an optional `exact` flag. Unknown fields and fields belonging to another strategy are rejected. Raw CSS and XPath are not accepted in the first slice.

## Fill values and run secrets

Fill actions use one of these explicit sources:

```json
{ "source": "literal", "value": "test-user@example.com" }
```

```json
{ "source": "run-secret", "secretRef": "LOGIN_PASSWORD" }
```

Rules:

- A literal is durable and must be non-sensitive test data.
- A run-secret reference is durable, but its value is not.
- Required run-secret names are derived from the selected journey before execution.
- Missing run secrets block execution before provisioning begins.
- Only the human-facing Tokyo Tester UI accepts secret values. MCP tools and AI clients may author references and receive missing-reference names, but never accept or return values.
- Run-secret values are excluded from workflow persistence, revisions, exports, receipts, logs, structured results, and diagnostics.
- Evidence handling for a secret-bearing journey follows the separately resolved evidence policy. Runtime research currently requires suppressing Playwright traces unless audited sanitization is proven.

## Validation and normalization

Validation remains strict and rejects unknown fields.

Normalization produces one internal scenario-plan union behind a single runner seam:

```text
ScenarioPlan
├── LegacyTestPlan
│   └── existing []config.TestConfig behavior
└── JourneyPlan
    ├── EnvironmentDriver
    └── ordered []ScenarioStep
```

Compatibility rules:

1. Schema v1 continues through the existing v1-to-v2 normalization.
2. A valid v2 scenario normalizes in memory to `LegacyTestPlan` without rewriting its serialized bundle or persisted revision.
3. A v3 `legacy-tests` scenario uses the same validation, ordering, retry, execution, result, resume, and diagnostic behavior as the equivalent v2 scenario.
4. A v3 `journey` scenario normalizes to `JourneyPlan` and executes once through the environment-driver module; it is not flattened into independent legacy tests.
5. The normalizer does not split or reinterpret existing combined operations and expectations.
6. IDs, names, target services, explicit dependencies, retry policies, ordering, and result identity remain unchanged for legacy tests.

The existing legacy executor registry remains behind the legacy adapter. The new browser-execution module receives one complete normalized journey so browser session state does not leak into the top-level scenario loop.

## Persistence and export

- Existing durable scenario rows remain `legacy-tests` by default; no destructive data rewrite is required.
- Durable scenario storage must represent the execution-model discriminator and the two strict payload variants explicitly. Journey fields must not be hidden in the generic metadata field or stored under misleading legacy test names.
- A workflow containing only existing legacy scenarios may continue exporting schema v2 so unchanged workflows remain byte-shape compatible.
- A workflow containing any journey exports schema v3. Its legacy scenarios are emitted with `executionModel: legacy-tests`; journey scenarios use `executionModel: journey`.
- Importing v3 materializes the selected execution model without converting journey steps into tests.
- Revision snapshots preserve the original scenario model and never contain resolved run-secret values.

## MCP and Tokyo Tester skill contract

`tokyo_get_capabilities` must advertise:

- accepted bundle versions and the preferred authoring version;
- both v3 scenario execution models;
- the browser environment fields;
- supported step kinds, operations, locators, value sources, timeout limits, and evidence policy;
- that run-secret values are human-only.

`tokyo_review_workflow_plan` must accept compact environment-driver and journey summaries. `tokyo_validate_workflow` must validate and normalize v2 or v3 and bind its receipt to the exact normalized bundle. Import and run tools keep the existing approval and receipt rules. Missing run secrets are visible as structured requirement names, never as value-bearing MCP arguments.

The packaged Tokyo Tester skill must teach agents to derive browser routes and accessibility locators from local repository evidence, author v3 journeys, keep source files and secrets out of MCP, and understand browser step diagnostics.

## Rejected alternatives

- **Replace every v2 test with action/assertion steps now:** rejected because it changes semantics and expands the first slice far beyond browser execution.
- **Add `browser` to the v2 test enum:** rejected because a shared browser session is a journey-level resource, not an independent test executor.
- **Infer the scenario model from field presence:** rejected because partial payloads produce ambiguous human and agent errors.
- **Represent the managed browser as a workflow service node:** rejected because the service graph describes the system under test, while the browser is an environment driver owned by execution.
- **Expose Playwright or Chromium settings in the bundle:** rejected because they are runner policy and would couple durable workflows to one adapter implementation.
