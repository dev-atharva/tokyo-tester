package workflowbundle

import (
	"strings"
	"testing"
)

func validStrictBundle() *Bundle {
	return &Bundle{
		SchemaVersion: SchemaVersion,
		Kind:          BundleKind,
		Workflow: Workflow{
			Name: "strict validation",
			Nodes: []FlowNode{
				workflowNode("api", "generic"),
				workflowNode("redis", "redis"),
			},
			Edges: []FlowEdge{workflowEdge("cache", "api", "redis", "source_requires_target")},
		},
		Scenarios: []BundleScenario{{
			Name: "health",
			Tests: []ScenarioTestDefinition{{
				ID:             "health",
				Name:           "API health",
				Type:           "http",
				TargetServices: []string{"api"},
				HTTPConfig: &HTTPConfig{
					Method:         "GET",
					Path:           "/health",
					Port:           "8080",
					ExpectedStatus: 200,
				},
			}},
			TestOrder: []string{"health"},
		}},
	}
}

func TestStrictValidationRejectsAmbiguousWorkflowGraphs(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*Bundle)
		message string
	}{
		{
			name: "unsupported service type",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Nodes[1].Data.Service.Type = "elasticsearch"
			},
			message: "unsupported service type",
		},
		{
			name: "duplicate node id",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Nodes[1].ID = bundle.Workflow.Nodes[0].ID
			},
			message: "duplicate node id",
		},
		{
			name: "colliding sanitized labels",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Nodes[0].Data.Label = "User API"
				bundle.Workflow.Nodes[1].Data.Label = "user-api"
			},
			message: "sanitized service name",
		},
		{
			name: "edge with unknown endpoint",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Edges[0].Target = "missing"
			},
			message: "unknown target node",
		},
		{
			name: "invalid container port",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Nodes[0].Data.Service.Ports = []PortMapping{{ContainerPort: "70000"}}
			},
			message: "invalid container port",
		},
		{
			name: "invalid wait strategy",
			mutate: func(bundle *Bundle) {
				bundle.Workflow.Nodes[0].Data.Service.WaitStratergy = &WaitStrategyState{Enabled: true, Type: "sleep"}
			},
			message: "invalid wait strategy",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bundle := validStrictBundle()
			test.mutate(bundle)
			if err := bundle.Validate(); err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("Validate() error = %v, want message containing %q", err, test.message)
			}
		})
	}
}

func TestStrictValidationRejectsInvalidScenarioContracts(t *testing.T) {
	tests := []struct {
		name    string
		mutate  func(*ScenarioTestDefinition)
		message string
	}{
		{
			name:    "empty test id",
			mutate:  func(test *ScenarioTestDefinition) { test.ID = "" },
			message: "without an id",
		},
		{
			name:    "unknown test type",
			mutate:  func(test *ScenarioTestDefinition) { test.Type = "grpc" },
			message: "unsupported type",
		},
		{
			name:    "missing matching config",
			mutate:  func(test *ScenarioTestDefinition) { test.HTTPConfig = nil },
			message: "requires httpConfig",
		},
		{
			name: "mismatched extra config",
			mutate: func(test *ScenarioTestDefinition) {
				test.DelayConfig = &DelayConfig{DurationMs: 1}
			},
			message: "must not include delayConfig",
		},
		{
			name:    "invalid HTTP method",
			mutate:  func(test *ScenarioTestDefinition) { test.HTTPConfig.Method = "CONNECT" },
			message: "invalid HTTP method",
		},
		{
			name:    "invalid HTTP path",
			mutate:  func(test *ScenarioTestDefinition) { test.HTTPConfig.Path = "health" },
			message: "HTTP path must start",
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			bundle := validStrictBundle()
			test.mutate(&bundle.Scenarios[0].Tests[0])
			if err := bundle.Validate(); err == nil || !strings.Contains(err.Error(), test.message) {
				t.Fatalf("Validate() error = %v, want message containing %q", err, test.message)
			}
		})
	}
}

func TestStrictValidationRejectsDuplicateTestNamesAndDependencyCycles(t *testing.T) {
	bundle := validStrictBundle()
	first := bundle.Scenarios[0].Tests[0]
	second := first
	second.ID = "health-copy"
	bundle.Scenarios[0].Tests = append(bundle.Scenarios[0].Tests, second)
	bundle.Scenarios[0].TestOrder = append(bundle.Scenarios[0].TestOrder, second.ID)
	if err := bundle.Validate(); err == nil || !strings.Contains(err.Error(), "duplicate test name") {
		t.Fatalf("Validate() error = %v, want duplicate test name", err)
	}

	bundle = validStrictBundle()
	first = bundle.Scenarios[0].Tests[0]
	first.DependsOnTestIDs = []string{"health-copy"}
	second = first
	second.ID = "health-copy"
	second.Name = "API health copy"
	second.DependsOnTestIDs = []string{"health"}
	bundle.Scenarios[0].Tests = []ScenarioTestDefinition{first, second}
	bundle.Scenarios[0].TestOrder = []string{"health", "health-copy"}
	if err := bundle.Validate(); err == nil || !strings.Contains(err.Error(), "dependency cycle") {
		t.Fatalf("Validate() error = %v, want dependency cycle", err)
	}
}

func TestDecodeRejectsUnknownContractFields(t *testing.T) {
	raw := `{
		"schemaVersion":2,
		"kind":"cots.workflow-bundle",
		"workflow":{"name":"typo","nodes":[{"id":"api","data":{"label":"api","service":{"type":"generic","image":"api:test"}}}],"edges":[]},
		"scenarios":[{"name":"health","tests":[{"id":"health","name":"health","type":"http","targetServices":["api"],"httpConfig":{"method":"GET","path":"/health","port":"8080","expectedStats":200}}],"testOrder":["health"]}]
	}`
	if _, err := Decode(strings.NewReader(raw)); err == nil || !strings.Contains(err.Error(), "/httpConfig/expectedStats") {
		t.Fatalf("Decode() error = %v, want unknown expectedStats field", err)
	}
}

func TestHTTPExpectedBodyModesRemainCompatibleWithUIBundles(t *testing.T) {
	for _, mode := range []string{"contains", "json_partial", "json"} {
		bundle := validStrictBundle()
		bundle.Scenarios[0].Tests[0].HTTPConfig.ExpectedBody = &ExpectedBody{Mode: mode, Value: map[string]any{"status": "healthy"}}
		if err := bundle.Validate(); err != nil {
			t.Fatalf("mode %q was rejected: %v", mode, err)
		}
	}
}
