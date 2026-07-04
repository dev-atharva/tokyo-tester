package workflowrun

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
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
