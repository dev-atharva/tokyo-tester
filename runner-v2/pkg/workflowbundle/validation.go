package workflowbundle

import (
	"fmt"
	"strings"
)

type ValidationIssue struct {
	Code        string `json:"code"`
	JSONPointer string `json:"jsonPointer"`
	Message     string `json:"message"`
	Suggestion  string `json:"suggestion,omitempty"`
}

// ValidationIssueFor converts the canonical validator's error into a stable,
// repair-oriented response. Validation remains centralized in Bundle.Validate.
func ValidationIssueFor(err error) ValidationIssue {
	if err == nil {
		return ValidationIssue{}
	}
	message := err.Error()
	issue := ValidationIssue{Code: "invalid_workflow_bundle", JSONPointer: "/", Message: message, Suggestion: "Correct the workflow bundle and validate it again."}
	switch {
	case strings.Contains(message, "invalid workflow bundle JSON"):
		issue.Code = "invalid_json"
		issue.Suggestion = "Return one JSON object that conforms to the published workflow-bundle schema."
	case strings.Contains(message, "schema version"):
		issue.Code = "unsupported_schema_version"
		issue.JSONPointer = "/schemaVersion"
		issue.Suggestion = "Use schemaVersion 2."
	case strings.Contains(message, "bundle kind"):
		issue.Code = "invalid_bundle_kind"
		issue.JSONPointer = "/kind"
		issue.Suggestion = "Set kind to cots.workflow-bundle."
	case strings.Contains(message, "workflow name"):
		issue.Code = "missing_workflow_name"
		issue.JSONPointer = "/workflow/name"
		issue.Suggestion = "Provide a non-empty workflow name."
	case strings.Contains(message, "circular dependencies"):
		issue.Code = "dependency_cycle"
		issue.JSONPointer = "/workflow/edges"
		issue.Suggestion = "Change edge readiness so the service dependency graph is acyclic."
	case strings.Contains(message, "unknown service"):
		issue.Code = "unknown_target_service"
		issue.JSONPointer = "/scenarios"
		issue.Suggestion = "Use the sanitized label of a service declared in workflow.nodes."
	case strings.Contains(message, "testOrder"):
		issue.Code = "invalid_test_order"
		issue.JSONPointer = "/scenarios"
		issue.Suggestion = "List every test id exactly once in testOrder."
	case strings.Contains(message, "invalid relation"):
		issue.Code = "invalid_edge_relation"
		issue.JSONPointer = "/workflow/edges"
		issue.Suggestion = "Use calls, reads, writes, publishes, or consumes."
	case strings.Contains(message, "invalid readiness"):
		issue.Code = "invalid_edge_readiness"
		issue.JSONPointer = "/workflow/edges"
		issue.Suggestion = "Use none, source_requires_target, or target_requires_source."
	case strings.Contains(message, "must specify the docker image"):
		issue.Code = "missing_service_image"
		issue.JSONPointer = "/workflow/nodes"
		issue.Suggestion = "Set service.image for every generic service."
	case strings.Contains(message, "runtime reference"):
		issue.Code = "unreachable_runtime_reference"
		issue.JSONPointer = "/workflow/edges"
		issue.Suggestion = "Add a readiness dependency from the referencing service to the referenced service."
	}
	return issue
}

func InlineSecretIssues(bundle *Bundle) []ValidationIssue {
	issues := make([]ValidationIssue, 0)
	for index, node := range bundle.Workflow.Nodes {
		registry := node.Data.Service.Registry
		if registry == nil {
			continue
		}
		if strings.TrimSpace(registry.Password) == "" && strings.TrimSpace(registry.Token) == "" {
			continue
		}
		issues = append(issues, ValidationIssue{
			Code:        "inline_secret_forbidden",
			JSONPointer: fmt.Sprintf("/workflow/nodes/%d/data/service/registry", index),
			Message:     fmt.Sprintf("service %q contains inline registry credentials", node.Data.Label),
			Suggestion:  "Remove credentials from the bundle and configure them in Tokyo Tester's secret store.",
		})
	}
	return issues
}
