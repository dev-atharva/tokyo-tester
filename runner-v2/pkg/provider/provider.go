package provider

import (
	"context"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
)

// ServiceProvider is the interface that all providers must implement
type ServiceProvider interface {
	//This is supposed to create and start the container for the service oin specified network
	Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error)

	// This is supposed to cleanup the containers
	Cleanup(ctx context.Context, container testcontainers.Container) error
}

// Registry holds all available providers
type Registry struct {
	providers map[string]ServiceProvider
}

func NewRegistry() *Registry {
	r := &Registry{
		providers: make(map[string]ServiceProvider),
	}
	r.providers["generic"] = &GenericProvider{}
	return r
}

func (r *Registry) Register(name string, provider ServiceProvider) {
	r.providers[name] = provider
}

func (r *Registry) Get(name string) (ServiceProvider, bool) {
	provider, ok := r.providers[name]
	return provider, ok
}
