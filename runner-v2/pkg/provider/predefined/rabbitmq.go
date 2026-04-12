package predefined

import (
	"context"
	"fmt"
	"log"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	tcprabbitmq "github.com/testcontainers/testcontainers-go/modules/rabbitmq"
)

const (
	defaultRabbitMQImage    = "rabbitmq:3.13-management-alpine"
	defaultRabbitMQUser     = "guest"
	defaultRabbitMQPassword = "guest"
)

type RabbitMQProvider struct{}

func (p *RabbitMQProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = defaultRabbitMQImage
	}

	username := getEnvOrDefault(cfg.Env, "RABBITMQ_DEFAULT_USER", defaultRabbitMQUser)
	password := getEnvOrDefault(cfg.Env, "RABBITMQ_DEFAULT_PASS", defaultRabbitMQPassword)

	container, err := p.createContainerWithFallback(ctx, cfg, image, username, password, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the rabbitmq container: %w", err)
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
				return nil, nil, fmt.Errorf("init script %d exited with code %d: %s", i, exitCode, stdOut)
			}
		}
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get container host: %w", err)
	}

	amqpPort, err := container.MappedPort(ctx, "5672/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get rabbitmq amqp port: %w", err)
	}

	httpPort, err := container.MappedPort(ctx, "15672/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get rabbitmq management port: %w", err)
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{
			"5672":  amqpPort.Port(),
			"15672": httpPort.Port(),
		},
		EnvVars: map[string]string{
			"RABBITMQ_AMQP_URL":     fmt.Sprintf("amqp://%s:%s@%s:%s/", username, password, host, amqpPort.Port()),
			"RABBITMQ_HTTP_URL":     fmt.Sprintf("http://%s:%s@%s:%s", username, password, host, httpPort.Port()),
			"RABBITMQ_DEFAULT_USER": username,
			"RABBITMQ_DEFAULT_PASS": password,
			"RABBITMQ_AMQP_HOST":    host,
			"RABBITMQ_AMQP_PORT":    amqpPort.Port(),
			"RABBITMQ_HTTP_HOST":    host,
			"RABBITMQ_HTTP_PORT":    httpPort.Port(),
		},
	}

	for key, value := range cfg.Env {
		runtime.EnvVars[key] = value
	}

	return container, runtime, nil
}

func (p *RabbitMQProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image, username, password string, network *testcontainers.DockerNetwork) (*tcprabbitmq.RabbitMQContainer, error) {
	originalImage := image

	buildOpts := func() []testcontainers.ContainerCustomizer {
		return []testcontainers.ContainerCustomizer{
			tcprabbitmq.WithAdminUsername(username),
			tcprabbitmq.WithAdminPassword(password),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     provider.ContainerName(ctx, cfg.Name),
					Labels:   provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
					Networks: []string{network.Name},
					NetworkAliases: map[string][]string{
						network.Name: {cfg.Name},
					},
					Env: cfg.Env,
				},
			}),
		}
	}

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)
		container, err := tcprabbitmq.Run(ctx, customImage, buildOpts()...)
		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker hub for image %s", originalImage)
	}

	container, err := tcprabbitmq.Run(ctx, originalImage, buildOpts()...)
	if err != nil {
		return nil, fmt.Errorf("failed to pull image from both custom registry and docker hub: %w", err)
	}
	return container, nil
}

func (p *RabbitMQProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
