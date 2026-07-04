package workflowbundle

import (
	"strings"
	"testing"
)

func workflowNode(id, serviceType string, env ...EnvironmentVariable) FlowNode {
	service := ServiceNodeData{Type: serviceType, Env: env}
	if serviceType == "generic" {
		service.Image = "example:latest"
	}
	return FlowNode{ID: id, Data: FlowNodeData{Label: id, Service: service}}
}

func workflowEdge(id, source, target, readiness string) FlowEdge {
	return FlowEdge{
		ID: id, Source: source, Target: target,
		Data: &FlowEdgeData{Relation: "calls", Readiness: readiness},
	}
}

func TestReadinessGraphAllowsDataCyclesAndRejectsStartupCycles(t *testing.T) {
	nodes := []FlowNode{workflowNode("app", "generic"), workflowNode("db", "postgres")}
	dataCycle := []FlowEdge{
		workflowEdge("write", "app", "db", "source_requires_target"),
		workflowEdge("read", "db", "app", "target_requires_source"),
	}
	if err := validateWorkflowGraph(nodes, dataCycle); err != nil {
		t.Fatalf("data cycle with acyclic readiness should be valid: %v", err)
	}
	if got := buildServiceDependencies(nodes, dataCycle)["app"]; len(got) != 1 || got[0] != "db" {
		t.Fatalf("unexpected app readiness dependencies: %v", got)
	}

	startupCycle := []FlowEdge{
		workflowEdge("one", "app", "db", "source_requires_target"),
		workflowEdge("two", "db", "app", "source_requires_target"),
	}
	if err := validateWorkflowGraph(nodes, startupCycle); err == nil || !strings.Contains(err.Error(), "circular dependencies") {
		t.Fatalf("expected readiness cycle error, got %v", err)
	}
}

func TestRuntimeReferenceRequiresReadiness(t *testing.T) {
	nodes := []FlowNode{
		workflowNode("app", "generic", EnvironmentVariable{Key: "DB_HOST", Value: "${db.host}"}),
		workflowNode("db", "postgres"),
	}
	edges := []FlowEdge{workflowEdge("data", "app", "db", "none")}
	if err := validateWorkflowGraph(nodes, edges); err == nil || !strings.Contains(err.Error(), "without a readiness prerequisite") {
		t.Fatalf("expected missing readiness error, got %v", err)
	}
}

func TestDecodeMigratesLegacyEdge(t *testing.T) {
	raw := `{
		"schemaVersion": 1,
		"kind": "cots.workflow-bundle",
		"workflow": {
			"name": "legacy",
			"nodes": [
				{"id":"app","data":{"label":"app","service":{"type":"generic","image":"example:latest"}}},
				{"id":"db","data":{"label":"db","service":{"type":"postgres"}}}
			],
			"edges": [{"id":"old","source":"app","target":"db"}]
		},
		"scenarios": [{
			"name":"smoke",
			"tests":[{"id":"test","name":"health","type":"http","targetServices":["app"],"httpConfig":{"method":"GET","path":"/","port":"8080","expectedStatus":200}}],
			"testOrder":["test"]
		}]
	}`
	bundle, err := Decode(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}
	edge := bundle.Workflow.Edges[0]
	if bundle.SchemaVersion != 2 || edge.Data.Relation != "calls" || edge.Data.Readiness != "source_requires_target" || !edge.Data.NeedsReview {
		t.Fatalf("legacy edge was not migrated: %#v", edge)
	}
}

func TestDecodeAndTranslateScenario(t *testing.T) {
	raw := `{
		"schemaVersion": 1,
		"kind": "cots.workflow-bundle",
		"workflow": {
			"name": "Smoke Tests",
			"description": "demo",
			"nodes": [
				{
					"id": "api-node",
					"data": {
						"label": "api",
						"service": {
							"type": "generic",
							"image": "ghcr.io/example/api:latest",
							"env": [],
							"ports": [],
							"initScripts": []
						}
					}
				}
			],
			"edges": []
		},
		"scenarios": [
			{
				"name": "Happy path",
				"description": "checks health",
				"tests": [
					{
						"id": "test-1",
						"name": "health check",
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
				"testOrder": ["test-1"]
			}
		]
	}`

	bundle, err := Decode(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatalf("TranslateScenario() error = %v", err)
	}

	if len(translated.Services) != 1 {
		t.Fatalf("expected 1 service, got %d", len(translated.Services))
	}
	if translated.Services[0].Name != "api" {
		t.Fatalf("unexpected service name: %s", translated.Services[0].Name)
	}
	if len(translated.Tests) != 1 {
		t.Fatalf("expected 1 test, got %d", len(translated.Tests))
	}
	if translated.Tests[0].Type != "http" {
		t.Fatalf("unexpected test type: %s", translated.Tests[0].Type)
	}
	if got := translated.Tests[0].Config["service"]; got != "api" {
		t.Fatalf("unexpected target service: %v", got)
	}
}

func TestDecodeRejectsInvalidSchemaVersion(t *testing.T) {
	raw := `{
		"schemaVersion": 3,
		"kind": "cots.workflow-bundle",
		"workflow": {
			"name": "Smoke Tests",
			"nodes": [],
			"edges": []
		},
		"scenarios": []
	}`

	if _, err := Decode(strings.NewReader(raw)); err == nil {
		t.Fatal("expected schema version error")
	}
}

func TestDecodeAndTranslateRabbitMQScenario(t *testing.T) {
	raw := `{
		"schemaVersion": 1,
		"kind": "cots.workflow-bundle",
		"workflow": {
			"name": "Queue Smoke Tests",
			"nodes": [
				{
					"id": "rabbit-node",
					"data": {
						"label": "rabbitmq",
						"service": {
							"type": "rabbitmq",
							"env": [],
							"ports": [],
							"initScripts": []
						}
					}
				}
			],
			"edges": []
		},
		"scenarios": [
			{
				"name": "Rabbit path",
				"tests": [
					{
						"id": "test-queue-1",
						"name": "rabbit publish",
						"type": "queue",
						"targetServices": ["rabbitmq"],
						"queueConfig": {
							"service": "rabbitmq",
							"brokerType": "rabbitmq",
							"operation": "produce",
							"topic": "orders",
							"message": "hello"
						}
					}
				],
				"testOrder": ["test-queue-1"]
			}
		]
	}`

	bundle, err := Decode(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatalf("TranslateScenario() error = %v", err)
	}

	if len(translated.Services) != 1 {
		t.Fatalf("expected 1 service, got %d", len(translated.Services))
	}
	if translated.Services[0].Type != "rabbitmq" {
		t.Fatalf("expected rabbitmq service type, got %s", translated.Services[0].Type)
	}
	if got := translated.Tests[0].Config["broker_type"]; got != "rabbitmq" {
		t.Fatalf("expected rabbitmq broker type, got %v", got)
	}
}

func TestDecodeAndTranslateMongoDBDocumentScenario(t *testing.T) {
	raw := `{
		"schemaVersion": 1,
		"kind": "cots.workflow-bundle",
		"workflow": {
			"name": "Document Smoke Tests",
			"nodes": [
				{
					"id": "mongo-node",
					"data": {
						"label": "mongodb",
						"service": {
							"type": "mongodb",
							"env": [],
							"ports": [],
							"initScripts": []
						}
					}
				}
			],
			"edges": []
		},
		"scenarios": [
			{
				"name": "Mongo path",
				"tests": [
					{
						"id": "test-document-1",
						"name": "find user",
						"type": "document",
						"targetServices": ["mongodb"],
						"documentConfig": {
							"service": "mongodb",
							"database": "appdb",
							"collection": "users",
							"operation": "find_one",
							"filter": { "email": "alice@example.com" },
							"expectedDocument": { "name": "Alice" }
						}
					}
				],
				"testOrder": ["test-document-1"]
			}
		]
	}`

	bundle, err := Decode(strings.NewReader(raw))
	if err != nil {
		t.Fatalf("Decode() error = %v", err)
	}

	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatalf("TranslateScenario() error = %v", err)
	}

	if len(translated.Services) != 1 {
		t.Fatalf("expected 1 service, got %d", len(translated.Services))
	}
	if translated.Services[0].Type != "mongodb" {
		t.Fatalf("expected mongodb service type, got %s", translated.Services[0].Type)
	}
	if translated.Tests[0].Type != "document" {
		t.Fatalf("expected document test type, got %s", translated.Tests[0].Type)
	}
	if got := translated.Tests[0].Config["collection"]; got != "users" {
		t.Fatalf("expected users collection, got %v", got)
	}
}
