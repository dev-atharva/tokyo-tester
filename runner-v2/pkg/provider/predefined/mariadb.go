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
	"github.com/testcontainers/testcontainers-go/modules/mariadb"
	testcontainerswait "github.com/testcontainers/testcontainers-go/wait"
)

type MariaDbProvider struct{}

func (m *MariaDbProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = "mariadb:11.0.3"
	}
	database := getEnvOrDefault(cfg.Env, "MARIA_DB", "testdb")
	username := getEnvOrDefault(cfg.Env, "MARIA_USER", "root")
	password := getEnvOrDefault(cfg.Env, "MARIA_PASSWORD", "root")

	initFiles, cleanupInitFiles, err := writeInitScriptsToTempFiles(cfg.InitScripts)

	if err != nil {
		return nil, nil, fmt.Errorf("failed to prepare init scripts: %w", err)
	}
	defer cleanupInitFiles()

	container, err := m.createContainerWithFallback(ctx, cfg, image, database, username, password, initFiles, network)

	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the mariadb container: %w", err)
	}
	// Resolve host + mapped port for test execution
	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get container host: %w", err)
	}
	mappedPort, err := container.MappedPort(ctx, "5432")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get the mapped port: %w", err)
	}
	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{
			"5432": mappedPort.Port(),
		},
		EnvVars: map[string]string{
			"MARIA_DB":       database,
			"MARIA_USER":     username,
			"MARIA_PASSWORD": password,
		},
	}
	return container, runtime, nil
}

func (p *MariaDbProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image, database, username, password string, initFiles []string, network *testcontainers.DockerNetwork) (*mariadb.MariaDBContainer, error) {
	originalImage := image

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)

		container, err := mariadb.Run(ctx,
			customImage,
			mariadb.WithDatabase(database),
			mariadb.WithUsername(username),
			mariadb.WithPassword(password),
			mariadb.WithScripts(initFiles...),
			testcontainers.WithWaitStrategy(testcontainerswait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     provider.ContainerName(ctx, cfg.Name),
					Labels:   provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
					Networks: []string{network.Name},
					NetworkAliases: map[string][]string{
						network.Name: {cfg.Name},
					},
				},
			}),
		)

		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to Docker hub for Image: %s", originalImage)
	}

	container, err := mariadb.Run(ctx,
		originalImage,
		mariadb.WithDatabase(database),
		mariadb.WithUsername(username),
		mariadb.WithPassword(password),
		mariadb.WithScripts(initFiles...),
		testcontainers.WithWaitStrategy(
			testcontainerswait.ForLog("database system is ready to accept connections").WithOccurrence(2),
		),
		testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
			ContainerRequest: testcontainers.ContainerRequest{
				Name:     provider.ContainerName(ctx, cfg.Name),
				Labels:   provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
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

func (p *MariaDbProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
