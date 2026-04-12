package predefined

import (
	"context"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/testcontainers/testcontainers-go/network"
)

func TestMongoDBProviderProvision(t *testing.T) {
	defer skipIfDockerUnavailablePanic(t)

	ctx := context.Background()

	dockerNetwork, err := network.New(ctx, network.WithLabels(provider.ResourceLabels(ctx, provider.ResourceTypeNetwork)))
	if err != nil {
		skipIfDockerUnavailable(t, err)
		t.Fatalf("network.New() error = %v", err)
	}
	defer func() {
		_ = dockerNetwork.Remove(ctx)
	}()

	p := &MongoDBProvider{}
	container, runtime, err := p.Provision(ctx, config.ServiceConfig{
		Name: "mongodb-test",
		Type: "mongodb",
		Env: map[string]string{
			"MONGO_INITDB_ROOT_USERNAME": "admin",
			"MONGO_INITDB_ROOT_PASSWORD": "secret",
			"MONGO_INITDB_DATABASE":      "appdb",
		},
	}, dockerNetwork)
	if err != nil {
		skipIfDockerUnavailable(t, err)
		t.Fatalf("Provision() error = %v", err)
	}
	defer func() {
		_ = p.Cleanup(ctx, container)
	}()

	if runtime == nil {
		t.Fatal("expected runtime to be returned")
	}
	if got := runtime.EnvVars["MONGODB_DATABASE"]; got != "appdb" {
		t.Fatalf("expected MONGODB_DATABASE=appdb, got %q", got)
	}
	if got := runtime.EnvVars["MONGODB_USERNAME"]; got != "admin" {
		t.Fatalf("expected MONGODB_USERNAME=admin, got %q", got)
	}
	if got := runtime.EnvVars["MONGODB_PASSWORD"]; got != "secret" {
		t.Fatalf("expected MONGODB_PASSWORD=secret, got %q", got)
	}
	if !strings.HasPrefix(runtime.EnvVars["MONGODB_URI"], "mongodb://") {
		t.Fatalf("unexpected MONGODB_URI: %q", runtime.EnvVars["MONGODB_URI"])
	}
	if runtime.MappedPorts["27017"] == "" {
		t.Fatalf("expected mapped port for mongodb, got %#v", runtime.MappedPorts)
	}
}
