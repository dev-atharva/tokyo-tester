package predefined

import (
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	testcontainerswait "github.com/testcontainers/testcontainers-go/wait"
)

// Provisions PostgreSQL containers
type PostgresProvider struct{}

func (p *PostgresProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = "postgres:16-alpine"
	}

	database := getEnvOrDefault(cfg.Env, "POSTGRES_DB", "testdb")
	username := getEnvOrDefault(cfg.Env, "POSTGRES_USER", "postgres")
	password := getEnvOrDefault(cfg.Env, "POSTGRES_PASSWORD", "postgres")

	initFiles, cleanupInitFiles, err := writeInitScriptsToTempFiles(cfg.InitScripts)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to prepare init scripts: %w", err)
	}
	defer cleanupInitFiles()

	container, err := p.createContainerWithFallback(ctx, cfg, image, database, username, password, initFiles, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the postgres container: %w", err)
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
		ContainerID: cfg.Name,
		Host:        host,
		MappedPorts: map[string]string{
			"5432": mappedPort.Port(),
		},
		EnvVars: map[string]string{
			"POSTGRES_DB":       database,
			"POSTGRES_USER":     username,
			"POSTGRES_PASSWORD": password,
		},
	}

	return container, runtime, nil
}

func (p *PostgresProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}

func (p *PostgresProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image, database, username, password string, initFiles []string, network *testcontainers.DockerNetwork) (*postgres.PostgresContainer, error) {
	originalImage := image

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)

		container, err := postgres.Run(ctx,
			customImage,
			postgres.WithDatabase(database),
			postgres.WithUsername(username),
			postgres.WithPassword(password),
			postgres.WithInitScripts(initFiles...),
			testcontainers.WithWaitStrategy(testcontainerswait.ForLog("database system is ready to accept connections").WithOccurrence(2)),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:     cfg.Name,
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

	container, err := postgres.Run(ctx,
		originalImage,
		postgres.WithDatabase(database),
		postgres.WithUsername(username),
		postgres.WithPassword(password),
		postgres.WithInitScripts(initFiles...),
		testcontainers.WithWaitStrategy(
			testcontainerswait.ForLog("database system is ready to accept connections").WithOccurrence(2),
		),
		testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
			ContainerRequest: testcontainers.ContainerRequest{
				Name:     cfg.Name,
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

func getEnvOrDefault(env map[string]string, key, defaultValue string) string {
	if val, ok := env[key]; ok {
		return val
	}
	return defaultValue
}

func writeInitScriptsToTempFiles(scripts []string) (files []string, cleanup func(), err error) {
	if len(scripts) == 0 {
		return nil, func() {}, nil
	}

	dir, err := os.MkdirTemp("", "pg-init-")
	if err != nil {
		return nil, nil, err
	}

	cleanup = func() {
		_ = os.RemoveAll(dir)
	}

	for i, script := range scripts {
		path := filepath.Join(dir, fmt.Sprintf("init-%d.sql", i))
		if err := os.WriteFile(path, []byte(script), 0644); err != nil {
			cleanup()
			return nil, nil, err
		}
		files = append(files, path)
	}

	return files, cleanup, nil
}
