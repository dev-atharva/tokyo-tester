package workflowbundle

import (
	"strings"
	"testing"
)

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
		"schemaVersion": 2,
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
