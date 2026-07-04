package workflowbundle

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
)

func TestValidationIssueForRepairableErrors(t *testing.T) {
	tests := []struct{ message, code, pointer string }{
		{"circular dependencies detected: api -> db", "dependency_cycle", "/workflow/edges"},
		{"scenario test \"read\" references unknown service \"db\"", "unknown_target_service", "/scenarios"},
		{"scenario \"smoke\" testOrder must include every test exactly once", "invalid_test_order", "/scenarios"},
	}
	for _, test := range tests {
		issue := ValidationIssueFor(assertionError(test.message))
		if issue.Code != test.code || issue.JSONPointer != test.pointer || issue.Suggestion == "" {
			t.Fatalf("unexpected issue for %q: %+v", test.message, issue)
		}
	}
}

func TestInlineRegistrySecretsAreRejectedByAgentValidation(t *testing.T) {
	bundle := &Bundle{Workflow: Workflow{Nodes: []FlowNode{{Data: FlowNodeData{Label: "api", Service: ServiceNodeData{Registry: &config.RegistryConfig{Password: "secret"}}}}}}}
	issues := InlineSecretIssues(bundle)
	if len(issues) != 1 || issues[0].Code != "inline_secret_forbidden" {
		t.Fatalf("unexpected issues: %+v", issues)
	}
}

type assertionError string

func (e assertionError) Error() string { return string(e) }
