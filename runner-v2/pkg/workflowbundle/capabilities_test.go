package workflowbundle

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
)

func TestAgentCapabilitiesIncludeCompactAuthoringGuidance(t *testing.T) {
	capabilities := AgentCapabilities()
	if !slices.Contains(capabilities.ResourceURIs, "tokyo://quality-rubric") {
		t.Fatalf("expected optional quality rubric resource: %+v", capabilities.ResourceURIs)
	}
	if !slices.Contains(capabilities.AuthoringRules, "Keep waitStratergy spelling in workflow JSON for schema version 2.") {
		t.Fatalf("expected waitStratergy authoring rule: %+v", capabilities.AuthoringRules)
	}
	payload, err := json.Marshal(capabilities)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) > 1800 {
		t.Fatalf("capabilities response is too large: %d bytes", len(payload))
	}
	if strings.Contains(string(payload), "workflow-bundle-v2.schema.json") {
		t.Fatal("capabilities should point to optional resources rather than embedding long schema guidance")
	}
}
