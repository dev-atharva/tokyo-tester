package workflowrun

import (
	"fmt"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

type Request struct {
	WorkflowRunID    string                           `json:"workflowRunId"`
	ProjectID        string                           `json:"projectId"`
	WorkflowID       string                           `json:"workflowId"`
	WorkflowName     string                           `json:"workflowName"`
	Nodes            []workflowbundle.FlowNode        `json:"nodes"`
	Edges            []workflowbundle.FlowEdge        `json:"edges"`
	Scenarios        []Scenario                       `json:"scenarios"`
	UserID           string                           `json:"userId,omitempty"`
	ClientID         string                           `json:"clientId,omitempty"`
	RegistrySecrets  map[string]config.RegistryConfig `json:"registrySecrets,omitempty"`
	ExecutionOptions ExecutionOptions                 `json:"executionOptions,omitempty"`
}

type Scenario struct {
	ID            string                                  `json:"id"`
	ScenarioRunID string                                  `json:"scenarioRunId"`
	ProjectID     string                                  `json:"projectId"`
	Name          string                                  `json:"name"`
	Description   string                                  `json:"description,omitempty"`
	Tests         []workflowbundle.ScenarioTestDefinition `json:"tests"`
	TestOrder     []string                                `json:"testOrder"`
	UserID        string                                  `json:"user_id,omitempty"`
	ClientID      string                                  `json:"client_id,omitempty"`
}

type ExecutionOptions struct {
	ContinueOnFailure bool `json:"continueOnFailure"`
}

func (r *Request) Validate() error {
	if strings.TrimSpace(r.WorkflowRunID) == "" || strings.TrimSpace(r.WorkflowID) == "" || strings.TrimSpace(r.ProjectID) == "" {
		return fmt.Errorf("workflowRunId, workflowId, and projectId are required")
	}
	if len(r.Scenarios) == 0 {
		return fmt.Errorf("at least one scenario is required")
	}
	seen := make(map[string]struct{}, len(r.Scenarios))
	for _, scenario := range r.Scenarios {
		if scenario.ID == "" || scenario.ScenarioRunID == "" || scenario.Name == "" {
			return fmt.Errorf("every scenario requires id, scenarioRunId, and name")
		}
		if _, exists := seen[scenario.ScenarioRunID]; exists {
			return fmt.Errorf("duplicate scenarioRunId %q", scenario.ScenarioRunID)
		}
		seen[scenario.ScenarioRunID] = struct{}{}
	}
	_, err := r.Bundle()
	return err
}

func (r *Request) Bundle() (*workflowbundle.Bundle, error) {
	nodes := append([]workflowbundle.FlowNode(nil), r.Nodes...)
	for index := range nodes {
		serviceName := workflowbundle.SanitizeName(nodes[index].Data.Label)
		secret, ok := r.RegistrySecrets[serviceName]
		if !ok {
			secret, ok = r.RegistrySecrets[nodes[index].Data.Label]
		}
		if !ok {
			secret, ok = r.RegistrySecrets[nodes[index].ID]
		}
		if ok && strings.TrimSpace(secret.URL) != "" {
			copy := secret
			nodes[index].Data.Service.Registry = &copy
		}
	}
	scenarios := make([]workflowbundle.BundleScenario, 0, len(r.Scenarios))
	for _, scenario := range r.Scenarios {
		scenarios = append(scenarios, workflowbundle.BundleScenario{
			Name: scenario.Name, Description: scenario.Description,
			Tests: scenario.Tests, TestOrder: scenario.TestOrder,
		})
	}
	bundle := &workflowbundle.Bundle{
		SchemaVersion: workflowbundle.SchemaVersion,
		Kind:          workflowbundle.BundleKind,
		Workflow: workflowbundle.Workflow{
			Name: r.WorkflowName, Nodes: nodes, Edges: r.Edges,
		},
		Scenarios: scenarios,
	}
	if err := bundle.Validate(); err != nil {
		return nil, err
	}
	return bundle, nil
}
