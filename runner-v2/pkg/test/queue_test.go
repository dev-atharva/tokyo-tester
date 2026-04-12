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

func TestQueueExecutorRabbitMQOperations(t *testing.T) {
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

	rabbitProvider := &predefined.RabbitMQProvider{}
	container, runtime, err := rabbitProvider.Provision(ctx, config.ServiceConfig{
		Name: "rabbitmq",
		Type: "rabbitmq",
	}, dockerNetwork)
	if err != nil {
		predefinedSkipIfDockerUnavailable(t, err)
		t.Fatalf("Provision() error = %v", err)
	}
	defer func() {
		_ = rabbitProvider.Cleanup(ctx, container)
	}()

	registry := orchestrator.NewRuntimeRegistry()
	registry.Regsiter(runtime)

	executor := &QueueExecutor{}

	tests := []struct {
		name string
		cfg  config.TestConfig
	}{
		{
			name: "check_topic missing queue",
			cfg: config.TestConfig{
				Name: "check-missing",
				Type: "queue",
				Config: map[string]any{
					"service":         "rabbitmq",
					"broker_type":     "rabbitmq",
					"operation":       "check_topic",
					"topic":           "missing-queue",
					"expected_exists": false,
				},
			},
		},
		{
			name: "produce",
			cfg: config.TestConfig{
				Name: "produce",
				Type: "queue",
				Config: map[string]any{
					"service":     "rabbitmq",
					"broker_type": "rabbitmq",
					"operation":   "produce",
					"topic":       "orders",
					"message":     "hello-rabbit",
					"key":         "order-1",
				},
			},
		},
		{
			name: "consume",
			cfg: config.TestConfig{
				Name: "consume",
				Type: "queue",
				Config: map[string]any{
					"service":          "rabbitmq",
					"broker_type":      "rabbitmq",
					"operation":        "consume",
					"topic":            "orders",
					"timeout":          5,
					"expected_count":   1,
					"expected_message": "hello-rabbit",
				},
			},
		},
		{
			name: "produce_and_consume",
			cfg: config.TestConfig{
				Name: "produce-and-consume",
				Type: "queue",
				Config: map[string]any{
					"service":     "rabbitmq",
					"broker_type": "rabbitmq",
					"operation":   "produce_and_consume",
					"topic":       "roundtrip",
					"message":     "roundtrip-message",
					"timeout":     5,
				},
			},
		},
		{
			name: "check_topic existing queue",
			cfg: config.TestConfig{
				Name: "check-existing",
				Type: "queue",
				Config: map[string]any{
					"service":         "rabbitmq",
					"broker_type":     "rabbitmq",
					"operation":       "check_topic",
					"topic":           "orders",
					"expected_exists": true,
				},
			},
		},
		{
			name: "list_topics",
			cfg: config.TestConfig{
				Name: "list-queues",
				Type: "queue",
				Config: map[string]any{
					"service":     "rabbitmq",
					"broker_type": "rabbitmq",
					"operation":   "list_topics",
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

func predefinedSkipIfDockerUnavailable(t *testing.T, err error) {
	t.Helper()
	predefinedSkipIfDockerUnavailableInner(t, err)
}
