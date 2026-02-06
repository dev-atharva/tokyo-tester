package predefined

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/redis"
)

type RedisProvider struct{}

func (p *RedisProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = "redis:7"
	}

	initFile, cleanupInit, err := writeRedisInitFile(cfg.InitScripts)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to prepare redis init file: %w", err)
	}
	defer cleanupInit()

	container, err := p.createContainerWithFallback(ctx, cfg, image, network)
	if err != nil {
		return nil, nil, err
	}

	if initFile != "" {
		const containerPath = "/tmp/redis-init.redis"
		if err = container.CopyFileToContainer(ctx,
			initFile,
			containerPath,
			0o644); err != nil {
			_ = container.Terminate(ctx)
			return nil, nil, fmt.Errorf("failed to copy redis init file: %w", err)
		}
		_, _, err := container.Exec(ctx, []string{
			"sh", "-c", fmt.Sprintf("redis-cli < %s", containerPath),
		})
		if err != nil {
			_ = container.Terminate(ctx)
			return nil, nil, fmt.Errorf("failed to execute redis init file: %w", err)
		}
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, err
	}

	port, err := container.MappedPort(ctx, "6379")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, err
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: cfg.Name,
		Host:        host,
		MappedPorts: map[string]string{
			"6379": port.Port(),
		},
		EnvVars: cfg.Env,
	}

	return container, runtime, nil
}

func (P *RedisProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}

func (P *RedisProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image string, network *testcontainers.DockerNetwork) (*redis.RedisContainer, error) {
	originalImage := image

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)

		container, err := redis.Run(ctx,
			customImage,
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     cfg.Name,
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

		log.Printf("Falling back to Docker hub for image : %s", originalImage)
	}

	container, err := redis.Run(ctx,
		originalImage,
		testcontainers.CustomizeRequest(
			testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     cfg.Name,
					Networks: []string{network.Name},
					NetworkAliases: map[string][]string{
						network.Name: {cfg.Name},
					},
					Env: cfg.Env,
				},
			},
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to pull image from custom registry and docker hub : %w", err)
	}
	return container, nil
}

func writeRedisInitFile(scripts []string) (string, func(), error) {
	if len(scripts) == 0 {
		return "", func() {}, nil
	}

	tmpFile, err := os.CreateTemp("", "redis-init-*.redis")
	if err != nil {
		return "", nil, err
	}

	for _, script := range scripts {
		if _, err := tmpFile.WriteString(script + "\n"); err != nil {
			_ = tmpFile.Close()
			return "", nil, err
		}
	}

	if err := tmpFile.Close(); err != nil {
		return "", nil, err
	}

	cleanup := func() {
		_ = os.Remove(tmpFile.Name())
	}
	return tmpFile.Name(), cleanup, nil
}
