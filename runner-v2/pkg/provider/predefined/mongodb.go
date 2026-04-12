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
	tcmongodb "github.com/testcontainers/testcontainers-go/modules/mongodb"
)

const (
	defaultMongoDBImage    = "mongo:7"
	defaultMongoDBDatabase = "testdb"
	defaultMongoDBUser     = "admin"
	defaultMongoDBPassword = "admin"
)

type MongoDBProvider struct{}

func (p *MongoDBProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = defaultMongoDBImage
	}

	database := getEnvOrDefault(cfg.Env, "MONGO_INITDB_DATABASE", defaultMongoDBDatabase)
	username := getEnvOrDefault(cfg.Env, "MONGO_INITDB_ROOT_USERNAME", defaultMongoDBUser)
	password := getEnvOrDefault(cfg.Env, "MONGO_INITDB_ROOT_PASSWORD", defaultMongoDBPassword)

	container, err := p.createContainerWithFallback(ctx, cfg, image, username, password, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the mongodb container: %w", err)
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

	port, err := container.MappedPort(ctx, "27017/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get mongodb port: %w", err)
	}

	connectionString, err := container.ConnectionString(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get mongodb connection string: %w", err)
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{
			"27017": port.Port(),
		},
		EnvVars: map[string]string{
			"MONGODB_URI":      connectionString,
			"MONGODB_DATABASE": database,
			"MONGODB_USERNAME": username,
			"MONGODB_PASSWORD": password,
		},
	}

	for key, value := range cfg.Env {
		runtime.EnvVars[key] = value
	}

	return container, runtime, nil
}

func (p *MongoDBProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image, username, password string, network *testcontainers.DockerNetwork) (*tcmongodb.MongoDBContainer, error) {
	originalImage := image

	buildOpts := func() []testcontainers.ContainerCustomizer {
		return []testcontainers.ContainerCustomizer{
			tcmongodb.WithUsername(username),
			tcmongodb.WithPassword(password),
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
		container, err := tcmongodb.Run(ctx, customImage, buildOpts()...)
		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker hub for image %s", originalImage)
	}

	container, err := tcmongodb.Run(ctx, originalImage, buildOpts()...)
	if err != nil {
		return nil, fmt.Errorf("failed to pull image from both custom registry and docker hub: %w", err)
	}
	return container, nil
}

func (p *MongoDBProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
