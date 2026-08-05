package workflowrun

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

func TestWorkflowRunInputContractFixture(t *testing.T) {
	fixture := filepath.Join("..", "..", "..", "contracts", "workflow-run-input.json")
	payload, err := os.ReadFile(fixture)
	if err != nil {
		t.Fatal(err)
	}
	var request Request
	if err := json.Unmarshal(payload, &request); err != nil {
		t.Fatal(err)
	}
	if err := request.Validate(); err != nil {
		t.Fatal(err)
	}
	bundle, err := request.Bundle()
	if err != nil {
		t.Fatal(err)
	}
	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatal(err)
	}
	if len(translated.Services) != 1 || translated.Services[0].Registry == nil {
		t.Fatalf("registry secret was not attached to translated service: %+v", translated.Services)
	}
	if translated.Services[0].Registry.Username != "contract-user" {
		t.Fatalf("unexpected registry credentials: %+v", translated.Services[0].Registry)
	}
}

func TestJourneyRequestBuildsVersionThreeBundleWithoutLegacyPayload(t *testing.T) {
	request := Request{
		WorkflowRunID: "run-1", ProjectID: "project-1", WorkflowID: "workflow-1", WorkflowName: "storefront",
		Nodes: []workflowbundle.FlowNode{{
			ID: "web", Data: workflowbundle.FlowNodeData{Label: "web", Service: workflowbundle.ServiceNodeData{Type: "generic", Image: "web:test", Ports: []workflowbundle.PortMapping{{ContainerPort: "3000"}}}},
		}},
		Scenarios: []Scenario{{
			ID: "scenario-1", ScenarioRunID: "scenario-run-1", ProjectID: "project-1", Name: "sign in", ExecutionModel: workflowbundle.ExecutionModelJourney,
			Environment: &workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: "web", TargetPort: "3000"}},
			Steps:       []workflowbundle.ScenarioStep{{ID: "open", Name: "open", Kind: "action", Action: &workflowbundle.StepAction{Operation: "navigate", Path: "/login"}}}, StepOrder: []string{"open"},
		}},
	}
	bundle, err := request.Bundle()
	if err != nil {
		t.Fatal(err)
	}
	if bundle.SchemaVersion != workflowbundle.SchemaVersionV3 || bundle.Scenarios[0].Tests != nil || bundle.Scenarios[0].ExecutionModel != workflowbundle.ExecutionModelJourney {
		t.Fatalf("unexpected journey bundle: %+v", bundle.Scenarios[0])
	}
}
