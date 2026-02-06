package provider

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/dev-atharva/cots/pkg/wait"
	"github.com/docker/go-connections/nat"
	"github.com/testcontainers/testcontainers-go"
	testcontainerswait "github.com/testcontainers/testcontainers-go/wait"
)

// Generic provider is responsible for creating containers for generic applications
type GenericProvider struct{}

// Provision create and start a generic container
func (g *GenericProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	if cfg.Image == "" {
		return nil, nil, fmt.Errorf("image is required for generic container")
	}
	req := testcontainers.ContainerRequest{
		Image:    cfg.Image,
		Env:      cfg.Env,
		Name:     cfg.Name,
		Networks: []string{network.Name},
		NetworkAliases: map[string][]string{
			network.Name: {cfg.Name},
		},
	}

	//Set command if specified
	if len(cfg.Command) > 0 {
		req.Cmd = cfg.Command
	}

	//Parse and set exposed ports
	exposedPorts := []string{}

	for _, portMapping := range cfg.Ports {
		parts := strings.Split(portMapping, ":")
		if len(parts) != 2 {
			return nil, nil, fmt.Errorf("invalid port mapping format , %s (expected host:container)", portMapping)
		}
		containerPort := parts[1]
		exposedPorts = append(exposedPorts, containerPort)

		// For the host we will wait for the testcontainers to assign one
		// Because you never know if its available on host.
	}
	req.ExposedPorts = exposedPorts

	// Set wait stratergy
	if cfg.WaitStratergy.Type != "" {
		stratergy, err := wait.CreateWaitStratergy(cfg.WaitStratergy)
		if err != nil {
			return nil, nil, fmt.Errorf("faild to create the wait startergy, %w", err)
		}
		req.WaitingFor = stratergy
	} else {
		timeout := 60 * time.Second
		req.WaitingFor = testcontainerswait.ForLog("").WithStartupTimeout(timeout)
	}

	container, err := g.createContainerWithFallback(ctx, cfg, req)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the container: %w", err)
	}

	if len(cfg.InitScripts) > 0 {
		for i, script := range cfg.InitScripts {
			exitCode, stdout, err := container.Exec(ctx, []string{"sh", "-c", script})
			if err != nil {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("failed to execute the init script %d: %s", i, err)
			}
			if exitCode != 0 {
				_ = container.Terminate(ctx)
				return nil, nil, fmt.Errorf("init script %d exited with code %d:%s", i, exitCode, stdout)
			}
		}
	}

	runtime, err := g.buildRuntime(ctx, cfg, container)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to build runtime info: %w", err)
	}
	return container, runtime, nil
}

// This builds the runtime info for the container
func (g *GenericProvider) buildRuntime(ctx context.Context, cfg config.ServiceConfig, container testcontainers.Container) (*types.ServiceRuntime, error) {
	host, err := container.Host(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get the container host: %w", err)
	}

	continerID := container.GetContainerID()

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: continerID,
		Host:        host,
		MappedPorts: make(map[string]string),
		EnvVars:     cfg.Env,
	}

	for _, portMapping := range cfg.Ports {
		parts := strings.Split(portMapping, ":")
		if len(parts) != 2 {
			continue
		}
		containerPort := parts[1]
		natPort := nat.Port(containerPort)

		mappedPort, err := container.MappedPort(ctx, natPort)
		if err != nil {
			return nil, fmt.Errorf("failed to get the mapped port for %s:%w", containerPort, err)
		}
		runtime.MappedPorts[containerPort] = mappedPort.Port()
	}
	return runtime, nil
}

func (g *GenericProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}

func (g *GenericProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, req testcontainers.ContainerRequest) (testcontainers.Container, error) {
	originalImage := req.Image

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(originalImage, cfg.Registry)
		req.Image = customImage

		log.Printf("Attempting to pull image from custom registry: %s", customImage)
		container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
			ContainerRequest: req,
			Started:          true,
		})

		if err == nil {
			return container, nil
		}

		log.Printf("Failed to pull from custom regsitry %s : %v", customImage, err)
	}

	req.Image = originalImage
	container, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})

	if err != nil {
		return nil, fmt.Errorf("failed to pull image from both custom registry and docker hub : %w", err)
	}
	return container, nil
}
