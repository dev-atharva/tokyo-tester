package predefined

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
)

const defaultNginxImage = "nginx:1.30.4-alpine"

type NginxProvider struct{}

func (p *NginxProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = defaultNginxImage
	}

	container, err := p.createContainerWithFallback(ctx, cfg, image, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the nginx container: %w", err)
	}

	if err := executeServiceInitScripts(ctx, container, cfg.InitScripts); err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to initialize nginx: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get nginx host: %w", err)
	}
	host = types.AddressableHost(host)

	httpPort, err := container.MappedPort(ctx, "80/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get nginx HTTP port: %w", err)
	}
	httpsPort, err := container.MappedPort(ctx, "443/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get nginx HTTPS port: %w", err)
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{"80": httpPort.Port(), "443": httpsPort.Port()},
		EnvVars:     cloneEnvironment(cfg.Env),
	}
	runtime.EnvVars["NGINX_HTTP_URL"] = fmt.Sprintf("http://%s", types.JoinHostPort(host, httpPort.Port()))
	runtime.EnvVars["NGINX_HTTPS_URL"] = fmt.Sprintf("https://%s", types.JoinHostPort(host, httpsPort.Port()))

	return container, runtime, nil
}

func (p *NginxProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image string, network *testcontainers.DockerNetwork) (testcontainers.Container, error) {
	create := func(candidate string) (testcontainers.Container, error) {
		return testcontainers.Run(ctx, candidate,
			testcontainers.WithExposedPorts("80/tcp", "443/tcp"),
			testcontainers.WithWaitStrategy(
				wait.ForHTTP("/").WithPort("80/tcp").WithStartupTimeout(60*time.Second),
			),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:               provider.ContainerName(ctx, cfg.Name),
					HostConfigModifier: provider.ResourceHostConfigModifier(cfg.Resources),
					Labels:             provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
					Networks:           []string{network.Name},
					NetworkAliases:     map[string][]string{network.Name: {cfg.Name}},
					Env:                cfg.Env,
					Cmd:                cfg.Command,
				},
			}),
		)
	}

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(image, cfg.Registry)
		container, err := create(customImage)
		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker hub for image %s", image)
	}

	container, err := create(image)
	if err != nil {
		return container, fmt.Errorf("failed to pull image from both custom registry and docker hub: %w", err)
	}
	return container, nil
}

func (p *NginxProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
