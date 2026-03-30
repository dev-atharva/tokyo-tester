package orchestrator

import (
	"context"
	"fmt"
	"sync"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/docker/docker/client"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
)

// Manages service provisioning and lifecycle
type Orchestrator struct {
	registry   *RuntimeRegsitry
	providers  *provider.Registry
	containers map[string]testcontainers.Container
	network    *testcontainers.DockerNetwork
	mu         sync.RWMutex
}

func NewOrchestrator(providers *provider.Registry) *Orchestrator {
	return &Orchestrator{
		registry:   NewRuntimeRegistry(),
		providers:  providers,
		containers: make(map[string]testcontainers.Container),
	}
}

// Provisions the services by respecting teh dependencies
func (o *Orchestrator) ProvisionServices(ctx context.Context, services []config.ServiceConfig) error {
	if err := o.authenticateRegisteries(ctx, services); err != nil {
		return fmt.Errorf("registry authentication failed : %w", err)
	}

	logger.InfoContext(ctx, "creating shared Docker network")
	dockerNetwork, err := network.New(ctx)
	if err != nil {
		return fmt.Errorf("failed to create the docker network ")
	}
	o.network = dockerNetwork
	logger.InfoContext(ctx, "Docker network created", "network_name", dockerNetwork.Name)

	graph := NewDependencyGraph()
	serviceMap := make(map[string]config.ServiceConfig)

	for _, svc := range services {
		graph.AddNode(svc.Name, svc.DependsOn)
		serviceMap[svc.Name] = svc
	}

	levels, err := graph.TopologicalSort()
	if err != nil {
		return fmt.Errorf("dependency resolution failed: %w", err)
	}

	for levelIdx, level := range levels {
		logger.InfoContext(ctx, "provisioning service level", "level", levelIdx+1, "services", level)
		if err := o.provisionlevel(ctx, level, serviceMap); err != nil {
			return o.WrapErrorWithLogs(ctx, err, "", true)
		}
	}
	return nil
}

func (o *Orchestrator) authenticateRegisteries(ctx context.Context, services []config.ServiceConfig) error {
	uniqueRegisteries := make(map[string]*config.RegistryConfig)
	for _, svc := range services {
		if svc.Registry != nil && svc.Registry.URL != "" {
			uniqueRegisteries[svc.Registry.URL] = svc.Registry
		}
	}

	if len(uniqueRegisteries) == 0 {
		return nil
	}

	logger.InfoContext(ctx, "authenticating with custom container registries", "count", len(uniqueRegisteries))
	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("failed to create Docker client: %w", err)
	}
	defer dockerClient.Close()

	for url, reg := range uniqueRegisteries {
		logger.DebugContext(ctx, "authenticating with regsitry", "registry_url", url)
		if err := registry.AuthenticateRegistry(ctx, dockerClient, reg); err != nil {
			logger.WarnContext(ctx, "failed to authenticate with registry, falling back to docker hub", "registry_url", url, "error", err)
		} else {
			logger.InfoContext(ctx, "successfully authenticated with registry", "registry_url", url)
		}
	}
	return nil
}

func (o *Orchestrator) provisionlevel(ctx context.Context, serviceNames []string, serviceMap map[string]config.ServiceConfig) error {
	readyChans := make(map[string]chan struct{})
	for _, name := range serviceNames {
		readyChans[name] = make(chan struct{})
	}
	var wg sync.WaitGroup
	errChan := make(chan error, len(serviceNames))
	for _, name := range serviceNames {
		wg.Add(1)
		go func(serviceName string) {
			defer wg.Done()
			cfg := serviceMap[serviceName]

			// Wait for dependencies
			for _, dep := range cfg.DependsOn {
				if ch, ok := readyChans[dep]; ok {
					<-ch
				}
			}

			// Get provider first
			providerInst, ok := o.providers.Get(cfg.Type)
			if !ok {
				errChan <- fmt.Errorf("service %s: provider not found: %s", serviceName, cfg.Type)
				return
			}

			// Interpolate env vars right before provisioning
			finalCfg := cfg
			if len(cfg.Env) > 0 {
				interpolated, err := o.registry.InterpolateEnvVars(cfg.Env)
				if err != nil {
					errChan <- fmt.Errorf("service %s : env interpolation failed: %w", serviceName, err)
					return
				}
				finalCfg.Env = interpolated
			}

			// Provision with interpolated config
			serviceCtx := logger.WithFields(ctx, "service_name", serviceName, "service_type", finalCfg.Type)
			logger.DebugContext(serviceCtx, "provisioning service")
			container, runtime, err := providerInst.Provision(serviceCtx, finalCfg, o.network)
			if err != nil {
				if container != nil {
					o.mu.Lock()
					o.containers[serviceName] = container
					o.mu.Unlock()
				}
				enhancedErr := o.WrapErrorWithLogs(ctx, err, serviceName, false)
				errChan <- fmt.Errorf("service %s: provisioning failed: %w", serviceName, enhancedErr)
				return
			}

			o.mu.Lock()
			o.containers[serviceName] = container
			o.mu.Unlock()

			o.registry.Regsiter(runtime)
			close(readyChans[serviceName])
		}(name)
	}
	wg.Wait()
	close(errChan)

	for err := range errChan {
		if err != nil {
			return err
		}
	}
	return nil
}

func (o *Orchestrator) GetRegistry() *RuntimeRegsitry {
	return o.registry
}

func (o *Orchestrator) CleanUp(ctx context.Context) error {
	o.mu.Lock()
	defer o.mu.Unlock()

	var wg sync.WaitGroup
	errorChan := make(chan error, len(o.containers))

	for name, container := range o.containers {
		wg.Add(1)
		go func(serviceName string, cont testcontainers.Container) {
			defer wg.Done()
			serviceCtx := logger.WithFields(ctx, "service_name", serviceName)
			logger.InfoContext(serviceCtx, "cleaning up service")
			if err := cont.Terminate(serviceCtx); err != nil {
				errorChan <- fmt.Errorf("failed to cleanup %s: %w", serviceName, err)
			}
		}(name, container)
	}
	wg.Wait()
	close(errorChan)
	var errors []error
	for err := range errorChan {
		errors = append(errors, err)
	}
	if o.network != nil {
		logger.InfoContext(ctx, "removing Docker network", "network_name", o.network.Name)
		if err := o.network.Remove(ctx); err != nil {
			errors = append(errors, fmt.Errorf("failed to remove network: %w", err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("cleanup errors: %v", errors)
	}
	return nil
}
