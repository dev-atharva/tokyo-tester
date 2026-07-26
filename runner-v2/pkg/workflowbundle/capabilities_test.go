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
	database := capabilityFor(t, capabilities.TestTypes, "database")
	if slices.Contains(database.RequiredFields, "password") {
		t.Fatalf("database password must remain optional and deployment-provided: %+v", database.RequiredFields)
	}
	if !slices.Contains(database.AllowedValues["driver"], "postgres") || !slices.Contains(database.AllowedValues["driver"], "mariadb") {
		t.Fatalf("database driver values are incomplete: %+v", database.AllowedValues)
	}
	queue := capabilityFor(t, capabilities.TestTypes, "queue")
	if !slices.Contains(queue.AllowedValues["operation"], "produce_and_consume") {
		t.Fatalf("queue operation values are incomplete: %+v", queue.AllowedValues)
	}
	payload, err := json.Marshal(capabilities)
	if err != nil {
		t.Fatal(err)
	}
	if len(payload) > 2600 {
		t.Fatalf("capabilities response is too large: %d bytes", len(payload))
	}
	if strings.Contains(string(payload), "workflow-bundle-v2.schema.json") {
		t.Fatal("capabilities should point to optional resources rather than embedding long schema guidance")
	}
}

func capabilityFor(t *testing.T, capabilities []TestCapability, name string) TestCapability {
	t.Helper()
	for _, capability := range capabilities {
		if capability.Type == name {
			return capability
		}
	}
	t.Fatalf("missing %s capability", name)
	return TestCapability{}
}
