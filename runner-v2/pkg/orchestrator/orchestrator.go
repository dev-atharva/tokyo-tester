package orchestrator

import (
	"context"
	"fmt"
	"sync"

	"github.com/dev-atharva/cots/pkg/config"
	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/docker/docker/client"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
)

// Manages service provisioning and lifecycle
type Orchestrator struct {
	registry   *RuntimeRegsitry
	providers  *provider.Registry
	containers map[string]testcontainers.Container
	serviceIDs map[string]string
	network    *testcontainers.DockerNetwork
	mu         sync.RWMutex
}

func NewOrchestrator(providers *provider.Registry) *Orchestrator {
	return &Orchestrator{
		registry:   NewRuntimeRegistry(),
		providers:  providers,
		containers: make(map[string]testcontainers.Container),
		serviceIDs: make(map[string]string),
	}
}

// Provisions the services by respecting teh dependencies
func (o *Orchestrator) ProvisionServices(ctx context.Context, services []config.ServiceConfig) error {
	preparedServices, err := o.prepareRegistryImages(ctx, services)
	if err != nil {
		return fmt.Errorf("prepare registry images: %w", err)
	}
	services = preparedServices

	logger.InfoContext(ctx, "creating shared Docker network")
	executionevent.Report(ctx, executionevent.Activity{
		Stage: executionevent.StageProvision, Kind: "network", Status: "started", Message: "Creating isolated Docker network",
	})
	dockerNetwork, err := network.New(ctx, network.WithLabels(provider.ResourceLabels(ctx, provider.ResourceTypeNetwork)))
	if err != nil {
		wrapped := apperrors.Wrap(err, apperrors.ErrNetworkCreate, "failed to create the Docker network")
		executionevent.Report(ctx, executionevent.Activity{
			Stage: executionevent.StageProvision, Kind: "network", Status: "failed", Message: wrapped.Error(),
		})
		return wrapped
	}
	o.network = dockerNetwork
	logger.InfoContext(ctx, "Docker network created", "network_name", dockerNetwork.Name)
	executionevent.Report(ctx, executionevent.Activity{
		Stage: executionevent.StageProvision, Kind: "network", Status: "ready", Message: "Isolated Docker network is ready",
	})

	graph := NewDependencyGraph()
	serviceMap := make(map[string]config.ServiceConfig)

	for _, svc := range services {
		graph.AddNode(svc.Name, svc.DependsOn)
		serviceMap[svc.Name] = svc
		o.serviceIDs[svc.Name] = svc.ID
	}

	levels, err := graph.TopologicalSort()
	if err != nil {
		return apperrors.Wrap(err, apperrors.ErrDependencyCycle, "service dependency resolution failed")
	}

	for levelIdx, level := range levels {
		logger.InfoContext(ctx, "provisioning service level", "level", levelIdx+1, "services", level)
		if err := o.provisionlevel(ctx, level, serviceMap); err != nil {
			return o.WrapErrorWithLogs(ctx, err, "", true)
		}
	}
	return nil
}

func (o *Orchestrator) prepareRegistryImages(ctx context.Context, services []config.ServiceConfig) ([]config.ServiceConfig, error) {
	prepared := append([]config.ServiceConfig(nil), services...)
	hasCustomRegistry := false
	for _, svc := range prepared {
		if svc.Registry != nil && svc.Registry.URL != "" {
			hasCustomRegistry = true
			break
		}
	}
	if !hasCustomRegistry {
		return prepared, nil
	}

	dockerClient, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("create Docker client: %w", err)
	}
	defer dockerClient.Close()

	for index := range prepared {
		svc := &prepared[index]
		if svc.Registry == nil || svc.Registry.URL == "" {
			continue
		}

		logger.InfoContext(ctx, "pulling service image from configured registry", "service_name", svc.Name, "registry_url", svc.Registry.URL)
		executionevent.Report(ctx, executionevent.Activity{
			Stage: executionevent.StageProvision, Kind: "service", Status: "started", Message: fmt.Sprintf("Pulling image for service %q", svc.Name), ServiceID: svc.ID, ServiceName: svc.Name,
		})
		resolvedImage, pullErr := registry.PullImage(ctx, dockerClient, svc.Image, svc.Registry)
		if pullErr != nil {
			wrapped := apperrors.Wrap(pullErr, apperrors.ErrImagePull, "failed to pull service image").WithDetail("service", svc.Name)
			executionevent.Report(ctx, executionevent.Activity{
				Stage: executionevent.StageProvision, Kind: "service", Status: "failed", Message: wrapped.Error(), ServiceID: svc.ID, ServiceName: svc.Name,
			})
			return nil, wrapped
		}
		executionevent.Report(ctx, executionevent.Activity{
			Stage: executionevent.StageProvision, Kind: "service", Status: "running", Message: fmt.Sprintf("Image for service %q is available", svc.Name), ServiceID: svc.ID, ServiceName: svc.Name,
		})

		// The authenticated request pulled the image into the local daemon. Clear
		// the registry credentials before handing the config to providers so they
		// cannot log in globally or silently fall back to another registry.
		svc.Image = resolvedImage
		svc.Registry = nil
	}

	return prepared, nil
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
			executionevent.Report(ctx, executionevent.Activity{
				Stage: executionevent.StageProvision, Kind: "service", Status: "started", Message: fmt.Sprintf("Starting service %q", serviceName), ServiceID: cfg.ID, ServiceName: serviceName,
			})

			// Wait for dependencies
			for _, dep := range cfg.DependsOn {
				if ch, ok := readyChans[dep]; ok {
					<-ch
				}
			}

			// Get provider first
			providerInst, ok := o.providers.Get(cfg.Type)
			if !ok {
				err := apperrors.New(apperrors.ErrConfiguration, "service provider is not available").WithDetails(map[string]string{"service": serviceName, "type": cfg.Type})
				executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageProvision, Kind: "service", Status: "failed", Message: err.Error(), ServiceID: cfg.ID, ServiceName: serviceName})
				errChan <- err
				return
			}

			// Interpolate env vars right before provisioning
			finalCfg := cfg
			if len(cfg.Env) > 0 {
				interpolated, err := o.registry.InterpolateEnvVars(cfg.Env)
				if err != nil {
					wrapped := apperrors.Wrap(err, apperrors.ErrEnvVarMissing, "service environment interpolation failed").WithDetail("service", serviceName)
					executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageProvision, Kind: "service", Status: "failed", Message: wrapped.Error(), ServiceID: cfg.ID, ServiceName: serviceName})
					errChan <- wrapped
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
				wrapped := apperrors.Wrap(enhancedErr, apperrors.ErrServiceProvision, "service provisioning failed").WithDetail("service", serviceName)
				executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageProvision, Kind: "service", Status: "failed", Message: wrapped.Error(), ServiceID: cfg.ID, ServiceName: serviceName})
				errChan <- wrapped
				return
			}

			o.mu.Lock()
			o.containers[serviceName] = container
			o.mu.Unlock()

			o.registry.Regsiter(runtime)
			executionevent.Report(ctx, executionevent.Activity{
				Stage: executionevent.StageProvision, Kind: "service", Status: "ready", Message: fmt.Sprintf("Service %q is ready", serviceName), ServiceID: cfg.ID, ServiceName: serviceName,
			})
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

func (o *Orchestrator) RuntimeSnapshot() map[string]*types.ServiceRuntime {
	return o.registry.Snapshot()
}

func (o *Orchestrator) ContainerIDs() map[string]string {
	snapshot := o.registry.Snapshot()
	ids := make(map[string]string, len(snapshot))
	for name, runtime := range snapshot {
		if runtime == nil {
			continue
		}
		ids[name] = runtime.ContainerID
	}
	return ids
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
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "service", Status: "started", Message: fmt.Sprintf("Stopping service %q", serviceName), ServiceID: o.serviceIDs[serviceName], ServiceName: serviceName})
			serviceCtx := logger.WithFields(ctx, "service_name", serviceName)
			logger.InfoContext(serviceCtx, "cleaning up service")
			if err := cont.Terminate(serviceCtx); err != nil {
				wrapped := apperrors.Wrap(err, apperrors.ErrServiceCleanup, "failed to clean up service").WithDetail("service", serviceName)
				executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "service", Status: "failed", Message: wrapped.Error(), ServiceID: o.serviceIDs[serviceName], ServiceName: serviceName})
				errorChan <- wrapped
				return
			}
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "service", Status: "completed", Message: fmt.Sprintf("Service %q stopped", serviceName), ServiceID: o.serviceIDs[serviceName], ServiceName: serviceName})
		}(name, container)
	}
	wg.Wait()
	close(errorChan)
	var errors []error
	for err := range errorChan {
		errors = append(errors, err)
	}
	if o.network != nil {
		executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "network", Status: "started", Message: "Removing isolated Docker network"})
		logger.InfoContext(ctx, "removing Docker network", "network_name", o.network.Name)
		if err := o.network.Remove(ctx); err != nil {
			wrapped := apperrors.Wrap(err, apperrors.ErrNetworkCleanup, "failed to remove Docker network")
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "network", Status: "failed", Message: wrapped.Error()})
			errors = append(errors, wrapped)
		} else {
			executionevent.Report(ctx, executionevent.Activity{Stage: executionevent.StageCleanup, Kind: "network", Status: "completed", Message: "Isolated Docker network removed"})
		}
	}

	if len(errors) > 0 {
		return fmt.Errorf("cleanup errors: %v", errors)
	}
	return nil
}
