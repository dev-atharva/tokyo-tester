package predefined

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/kafka"
)

type KafkaProvider struct{}

func (p *KafkaProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = "confluentinc/confluent-local:7.5.0"
	}

	clusterID := getEnvOrDefault(cfg.Env, "CLUSTER_ID", "test-cluster")

	container, err := p.createContainerWithFallback(ctx, cfg, image, clusterID, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the kafka container : %w", err)
	}

	if len(cfg.InitScripts) > 0 {
		for i, script := range cfg.InitScripts {
			exitCode, stdOut, err := container.Exec(ctx, []string{"sh", "-c", script})
			if err != nil {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("failed to run the init script %d: %w", i, err)
			}
			if exitCode != 0 {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("init scripts %d exited with code %d: %s", i, exitCode, stdOut)
			}
		}
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get container host : %w", err)
	}
	brokers, err := container.Brokers(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get kafka brokers : %w", err)
	}

	var brokerPort string
	if len(brokers) > 0 {
		parts := strings.Split(brokers[0], ":")
		if len(parts) == 2 {
			brokerPort = parts[1]
		}
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{
			"9093": brokerPort,
		},
		EnvVars: map[string]string{
			"CLUSTER_ID":     clusterID,
			"KAFKA_BROKERS":  strings.Join(brokers, ","),
			"KAFKA_PROTOCOL": "PLAINTEXT",
		},
	}
	return container, runtime, nil
}

func (p *KafkaProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image, clusterID string, network *testcontainers.DockerNetwork) (*kafka.KafkaContainer, error) {
	originalImage := image

	buildOpts := func() []testcontainers.ContainerCustomizer {
		return []testcontainers.ContainerCustomizer{
			kafka.WithClusterID(clusterID),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{ContainerRequest: testcontainers.ContainerRequest{
				Name:     provider.ContainerName(ctx, cfg.Name),
				Labels:   provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
				Networks: []string{network.Name},
				NetworkAliases: map[string][]string{
					network.Name: {cfg.Name},
				},
				Env: cfg.Env,
			}}),
		}
	}

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)
		container, err := kafka.Run(ctx, customImage, buildOpts()...)
		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker hub for image %s", originalImage)
	}

	container, err := kafka.Run(ctx, originalImage, buildOpts()...)
	if err != nil {
		return nil, fmt.Errorf("failed to pull image from both custom registry and docker hub : %w", err)
	}
	return container, nil
}

func (p *KafkaProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
