package orchestrator

import (
	"context"
	"fmt"
	"sync"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
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
	fmt.Println("Creating shared Docker network...")
	dockerNetwork, err := network.New(ctx)
	if err != nil {
		return fmt.Errorf("failed to create the docker network ")
	}
	o.network = dockerNetwork
	fmt.Printf("Network created: %s\n", dockerNetwork.Name)

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
		fmt.Printf("Provisioning level %d: %v\n", levelIdx+1, level)
		if err := o.provisionlevel(ctx, level, serviceMap); err != nil {
			return fmt.Errorf("failed to provision level %d: %w", levelIdx+1, err)
		}
	}
	return nil
}

// provisions all services in a level in parallel
// func (o *Orchestrator) provisionlevel(ctx context.Context, serviceNames []string, serviceMap map[string]config.ServiceConfig) error {
// 	var wg sync.WaitGroup

// 	errChan := make(chan error, len(serviceNames))

// 	for _, name := range serviceNames {
// 		wg.Add(1)

// 		go func(serviceName string) {
// 			defer wg.Done()

// 			cfg := serviceMap[serviceName]

// 			//Interporlate environment variables
// 			if len(cfg.Env) > 0 {
// 				interpolated, err := o.registry.InterpolateEnvVars(cfg.Env)
// 				if err != nil {
// 					errChan <- fmt.Errorf("service %s: env interpolation failed: %w", serviceName, err)
// 					return
// 				}
// 				cfg.Env = interpolated
// 			}

// 			//Get provider
// 			providerInst, ok := o.providers.Get(cfg.Type)
// 			if !ok {
// 				errChan <- fmt.Errorf("service %s: provider not found: %s", serviceName, cfg.Type)
// 				return
// 			}

// 			fmt.Printf("Starting the service: %s (type: %s)\n", serviceName, cfg.Type)
// 			container, runtime, err := providerInst.Provision(ctx, cfg, o.network)
// 			if err != nil {
// 				errChan <- fmt.Errorf("service %s: provisioning failed : %w", serviceName, err)
// 				return
// 			}

// 			o.mu.Lock()
// 			o.containers[serviceName] = container
// 			o.mu.Unlock()

// 			o.registry.Regsiter(runtime)
// 			fmt.Printf("Service %s started successfully\n", serviceName)
// 		}(name)
// 	}

// 	wg.Wait()
// 	close(errChan)

// 	for err := range errChan {
// 		return err
// 	}
// 	return nil
// }

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

			for _, dep := range cfg.DependsOn {
				if ch, ok := readyChans[dep]; ok {
					<-ch
				}
			}

			if len(cfg.Env) > 0 {
				interpolated, err := o.registry.InterpolateEnvVars(cfg.Env)
				if err != nil {
					errChan <- fmt.Errorf("service %s : env interpolation failed: %w", serviceName, err)
					return
				}
				cfg.Env = interpolated
			}
			providerInst, ok := o.providers.Get(cfg.Type)
			if !ok {
				errChan <- fmt.Errorf("service %s: provider not found: %s", serviceName, cfg.Type)
				return
			}

			container, runtime, err := providerInst.Provision(ctx, cfg, o.network)
			if err != nil {
				errChan <- fmt.Errorf("service %s: provisioning failed: %w", serviceName, err)
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

	var errors []error

	for name, container := range o.containers {
		fmt.Printf("Cleaning up service %s\n", name)
		if err := container.Terminate(ctx); err != nil {
			errors = append(errors, fmt.Errorf("failed to cleanup %s: %w", name, err))
		}
	}

	if o.network != nil {
		fmt.Printf("Removing docker network: %s\n", o.network.Name)
		if err := o.network.Remove(ctx); err != nil {
			errors = append(errors, fmt.Errorf("failed to remove network: %w", err))
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("cleanup errors: %v", errors)
	}
	return nil
}
