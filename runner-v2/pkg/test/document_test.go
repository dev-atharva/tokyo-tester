package test

import (
	"context"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/provider/predefined"
	"github.com/testcontainers/testcontainers-go/network"
)

func TestDocumentExecutorMongoDBOperations(t *testing.T) {
	defer predefinedSkipIfDockerUnavailablePanic(t)

	ctx := context.Background()

	dockerNetwork, err := network.New(ctx, network.WithLabels(provider.ResourceLabels(ctx, provider.ResourceTypeNetwork)))
	if err != nil {
		predefinedSkipIfDockerUnavailable(t, err)
		t.Fatalf("network.New() error = %v", err)
	}
	defer func() {
		_ = dockerNetwork.Remove(ctx)
	}()

	mongoProvider := &predefined.MongoDBProvider{}
	container, runtime, err := mongoProvider.Provision(ctx, config.ServiceConfig{
		Name: "mongodb",
		Type: "mongodb",
		Env: map[string]string{
			"MONGO_INITDB_DATABASE": "appdb",
		},
	}, dockerNetwork)
	if err != nil {
		predefinedSkipIfDockerUnavailable(t, err)
		t.Fatalf("Provision() error = %v", err)
	}
	defer func() {
		_ = mongoProvider.Cleanup(ctx, container)
	}()

	registry := orchestrator.NewRuntimeRegistry()
	registry.Regsiter(runtime)

	executor := &DocumentExecutor{}

	tests := []struct {
		name string
		cfg  config.TestConfig
	}{
		{
			name: "insert_one",
			cfg: config.TestConfig{
				Name: "insert-user",
				Type: "document",
				Config: map[string]any{
					"service":    "mongodb",
					"database":   "appdb",
					"collection": "users",
					"operation":  "insert_one",
					"document": map[string]any{
						"name":  "Alice",
						"email": "alice@example.com",
						"role":  "admin",
					},
				},
			},
		},
		{
			name: "find_one",
			cfg: config.TestConfig{
				Name: "find-user",
				Type: "document",
				Config: map[string]any{
					"service":    "mongodb",
					"database":   "appdb",
					"collection": "users",
					"operation":  "find_one",
					"filter": map[string]any{
						"email": "alice@example.com",
					},
					"expected_document": map[string]any{
						"name":  "Alice",
						"role":  "admin",
						"email": "alice@example.com",
					},
				},
			},
		},
		{
			name: "find_many",
			cfg: config.TestConfig{
				Name: "find-many-users",
				Type: "document",
				Config: map[string]any{
					"service":    "mongodb",
					"database":   "appdb",
					"collection": "users",
					"operation":  "find_many",
					"filter": map[string]any{
						"role": "admin",
					},
					"expected_documents": []any{
						map[string]any{
							"email": "alice@example.com",
						},
					},
				},
			},
		},
		{
			name: "update_one",
			cfg: config.TestConfig{
				Name: "update-user",
				Type: "document",
				Config: map[string]any{
					"service":    "mongodb",
					"database":   "appdb",
					"collection": "users",
					"operation":  "update_one",
					"filter": map[string]any{
						"email": "alice@example.com",
					},
					"update": map[string]any{
						"$set": map[string]any{
							"role": "owner",
						},
					},
				},
			},
		},
		{
			name: "count_documents",
			cfg: config.TestConfig{
				Name: "count-users",
				Type: "document",
				Config: map[string]any{
					"service":        "mongodb",
					"database":       "appdb",
					"collection":     "users",
					"operation":      "count_documents",
					"filter":         map[string]any{"role": "owner"},
					"expected_count": 1,
				},
			},
		},
		{
			name: "exists true",
			cfg: config.TestConfig{
				Name: "exists-user",
				Type: "document",
				Config: map[string]any{
					"service":         "mongodb",
					"database":        "appdb",
					"collection":      "users",
					"operation":       "exists",
					"filter":          map[string]any{"email": "alice@example.com"},
					"expected_exists": true,
				},
			},
		},
		{
			name: "delete_one",
			cfg: config.TestConfig{
				Name: "delete-user",
				Type: "document",
				Config: map[string]any{
					"service":    "mongodb",
					"database":   "appdb",
					"collection": "users",
					"operation":  "delete_one",
					"filter": map[string]any{
						"email": "alice@example.com",
					},
				},
			},
		},
		{
			name: "exists false",
			cfg: config.TestConfig{
				Name: "missing-user",
				Type: "document",
				Config: map[string]any{
					"service":         "mongodb",
					"database":        "appdb",
					"collection":      "users",
					"operation":       "exists",
					"filter":          map[string]any{"email": "alice@example.com"},
					"expected_exists": false,
				},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := executor.Execute(ctx, tt.cfg, registry); err != nil {
				t.Fatalf("Execute() error = %v", err)
			}
		})
	}
}
