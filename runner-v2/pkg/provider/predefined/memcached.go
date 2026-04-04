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
	"github.com/testcontainers/testcontainers-go/modules/memcached"
)

type MemcachedProvider struct{}

func (p *MemcachedProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = "memcached:1.6-alpine"
	}
	container, err := p.createContainerWithFallback(ctx, cfg, image, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start memcached container: %w", err)
	}

	if len(cfg.InitScripts) > 0 {
		for i, script := range cfg.InitScripts {
			exitCode, stdout, err := container.Exec(ctx, []string{"sh", "-c", script})
			if err != nil {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("failed to execute init script %d : %w", i, err)
			}
			if exitCode != 0 {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("init script exited %d exited with code %d : %s", i, exitCode, stdout)
			}
		}
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get host : %w", err)
	}
	mappedPort, err := container.MappedPort(ctx, "11211")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get mapped port : %w", err)
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{
			"11211": mappedPort.Port(),
		},
		EnvVars: cfg.Env,
	}

	return container, runtime, nil
}

func (p *MemcachedProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image string, network *testcontainers.DockerNetwork) (*memcached.Container, error) {
	originalImage := image

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)

		container, err := memcached.Run(ctx,
			customImage,
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     provider.ContainerName(ctx, cfg.Name),
					Networks: []string{network.Name},
					NetworkAliases: map[string][]string{
						network.Name: {cfg.Name},
					},
					Env: cfg.Env,
				},
			}),
		)

		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker for image: %s", originalImage)
	}

	container, err := memcached.Run(ctx,
		originalImage,
		testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
			ContainerRequest: testcontainers.ContainerRequest{
				Name:     provider.ContainerName(ctx, cfg.Name),
				Networks: []string{network.Name},
				NetworkAliases: map[string][]string{
					network.Name: {cfg.Name},
				},
			},
		}),
	)

	if err != nil {
		return nil, fmt.Errorf("failed to pull image from both custom registry and docker hub : %w", err)
	}
	return container, nil
}

func (p *MemcachedProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
