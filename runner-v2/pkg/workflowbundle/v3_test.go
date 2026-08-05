package workflowbundle

import (
	"strings"
	"testing"
)

const mixedV3Bundle = `{
  "schemaVersion": 3,
  "kind": "cots.workflow-bundle",
  "workflow": {
    "name": "storefront",
    "nodes": [{
      "id": "web-node",
      "data": {
        "label": "storefront web",
        "service": {
          "type": "generic",
          "image": "storefront:test",
          "ports": [{"hostPort": "", "containerPort": "3000"}]
        }
      }
    }],
    "edges": []
  },
  "scenarios": [
    {
      "name": "legacy health",
      "executionModel": "legacy-tests",
      "tests": [{
        "id": "health",
        "name": "health",
        "type": "http",
        "targetServices": ["storefront_web"],
        "httpConfig": {"method": "GET", "path": "/health", "port": "3000", "expectedStatus": 200}
      }],
      "testOrder": ["health"]
    },
    {
      "name": "customer signs in",
      "executionModel": "journey",
      "environment": {
        "driver": "browser",
        "browser": {"targetService": "storefront_web", "targetPort": "3000"}
      },
      "steps": [
        {
          "id": "open-login",
          "name": "open login",
          "kind": "action",
          "action": {"operation": "navigate", "path": "/login"}
        },
        {
          "id": "enter-password",
          "name": "enter password",
          "kind": "action",
          "action": {
            "operation": "fill",
            "locator": {"strategy": "label", "value": "Password"},
            "value": {"source": "run-secret", "secretRef": "LOGIN_PASSWORD"}
          }
        },
        {
          "id": "submit",
          "name": "submit",
          "kind": "action",
          "action": {
            "operation": "click",
            "locator": {"strategy": "role", "role": "button", "name": "Sign in"}
          }
        },
        {
          "id": "dashboard",
          "name": "reach dashboard",
          "kind": "assertion",
          "timeoutMs": 10000,
          "assertion": {"operation": "url", "path": "/dashboard"}
        }
      ],
      "stepOrder": ["open-login", "enter-password", "submit", "dashboard"]
    }
  ]
}`

func TestDecodeAndNormalizeMixedV3ScenarioModels(t *testing.T) {
	bundle, err := Decode(strings.NewReader(mixedV3Bundle))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	if bundle.SchemaVersion != 3 {
		t.Fatalf("schemaVersion = %d, want 3", bundle.SchemaVersion)
	}
	if got := bundle.Scenarios[0].ExecutionModel; got != ExecutionModelLegacyTests {
		t.Fatalf("legacy executionModel = %q", got)
	}
	if got := bundle.Scenarios[1].ExecutionModel; got != ExecutionModelJourney {
		t.Fatalf("journey executionModel = %q", got)
	}

	legacy, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatalf("TranslateScenario(legacy) error = %v", err)
	}
	if legacy.ExecutionModel != ExecutionModelLegacyTests || len(legacy.Tests) != 1 || legacy.Journey != nil {
		t.Fatalf("legacy translation = %+v", legacy)
	}

	journey, err := bundle.TranslateScenario(bundle.Scenarios[1])
	if err != nil {
		t.Fatalf("TranslateScenario(journey) error = %v", err)
	}
	if journey.ExecutionModel != ExecutionModelJourney || len(journey.Tests) != 0 || journey.Journey == nil {
		t.Fatalf("journey translation = %+v", journey)
	}
	if journey.Journey.Environment.Browser.TargetService != "storefront_web" || len(journey.Journey.Steps) != 4 {
		t.Fatalf("normalized journey = %+v", journey.Journey)
	}
}

func TestV2NormalizesLosslesslyToLegacyExecutionModel(t *testing.T) {
	bundle := validStrictBundle()
	bundle.SchemaVersion = 2
	if err := bundle.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	if bundle.Scenarios[0].ExecutionModel != ExecutionModelLegacyTests {
		t.Fatalf("executionModel = %q", bundle.Scenarios[0].ExecutionModel)
	}
	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatalf("TranslateScenario() error = %v", err)
	}
	if translated.ExecutionModel != ExecutionModelLegacyTests || len(translated.Tests) != 1 {
		t.Fatalf("translation changed v2 behavior: %+v", translated)
	}
}

func TestV3RejectsMixedScenarioPayloads(t *testing.T) {
	raw := strings.Replace(
		mixedV3Bundle,
		`"stepOrder": ["open-login", "enter-password", "submit", "dashboard"]`,
		`"stepOrder": ["open-login", "enter-password", "submit", "dashboard"], "tests": []`,
		1,
	)
	if _, err := Decode(strings.NewReader(raw)); err == nil || !strings.Contains(err.Error(), "must not include tests") {
		t.Fatalf("Decode() error = %v, want mixed scenario rejection", err)
	}
}
