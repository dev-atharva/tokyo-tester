package predefined

import (
	"context"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/testcontainers/testcontainers-go/network"
)

func TestRabbitMQProviderProvision(t *testing.T) {
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

	p := &RabbitMQProvider{}
	container, runtime, err := p.Provision(ctx, config.ServiceConfig{
		Name: "rabbitmq-test",
		Type: "rabbitmq",
		Env: map[string]string{
			"RABBITMQ_DEFAULT_USER": "admin",
			"RABBITMQ_DEFAULT_PASS": "secret",
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
	if got := runtime.EnvVars["RABBITMQ_DEFAULT_USER"]; got != "admin" {
		t.Fatalf("expected RABBITMQ_DEFAULT_USER=admin, got %q", got)
	}
	if got := runtime.EnvVars["RABBITMQ_DEFAULT_PASS"]; got != "secret" {
		t.Fatalf("expected RABBITMQ_DEFAULT_PASS=secret, got %q", got)
	}
	if !strings.HasPrefix(runtime.EnvVars["RABBITMQ_AMQP_URL"], "amqp://admin:secret@") {
		t.Fatalf("unexpected RABBITMQ_AMQP_URL: %q", runtime.EnvVars["RABBITMQ_AMQP_URL"])
	}
	if !strings.HasPrefix(runtime.EnvVars["RABBITMQ_HTTP_URL"], "http://admin:secret@") {
		t.Fatalf("unexpected RABBITMQ_HTTP_URL: %q", runtime.EnvVars["RABBITMQ_HTTP_URL"])
	}
	if runtime.MappedPorts["5672"] == "" || runtime.MappedPorts["15672"] == "" {
		t.Fatalf("expected mapped ports for amqp and management, got %#v", runtime.MappedPorts)
	}
}

func skipIfDockerUnavailablePanic(t *testing.T) {
	t.Helper()

	if recovered := recover(); recovered != nil {
		if err, ok := recovered.(error); ok {
			skipIfDockerUnavailable(t, err)
		}
		t.Skipf("docker unavailable for integration test: %v", recovered)
	}
}

func skipIfDockerUnavailable(t *testing.T, err error) {
	t.Helper()

	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "docker") ||
		strings.Contains(lower, "daemon") ||
		strings.Contains(lower, "socket") ||
		strings.Contains(lower, "cannot connect") {
		t.Skipf("docker unavailable for integration test: %v", err)
	}
}
