package test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
)

func TestHTTPExecutorAcceptsCamelCaseAssertions(t *testing.T) {
	registry := orchestrator.NewRuntimeRegistry()
	registry.Regsiter(&types.ServiceRuntime{
		Name: "api", Host: "localhost", MappedPorts: map[string]string{"8080": "49152"}, EnvVars: map[string]string{},
	})
	executor := &HTTPExecutor{client: &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host != "127.0.0.1:49152" {
			t.Fatalf("request host = %q", request.URL.Host)
		}
		if got := request.Header.Get("Idempotency-Key"); got != "payment-1" {
			t.Fatalf("Idempotency-Key = %q", got)
		}
		return &http.Response{
			StatusCode: http.StatusCreated,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"status":"created"}`)),
			Request:    request,
		}, nil
	})}}

	err := executor.Execute(context.Background(), config.TestConfig{Config: map[string]any{
		"service": "api", "port": json.Number("8080"), "expectedStatus": "201",
		"expectedBody": map[string]any{"status": "created"},
		"headers":      map[string]string{"Idempotency-Key": "payment-1"},
	}}, registry)
	if err != nil {
		t.Fatalf("Execute() error = %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (fn roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return fn(request)
}

func TestShellAndDelayExecutorsAcceptCamelCaseValues(t *testing.T) {
	registry := orchestrator.NewRuntimeRegistry()
	registry.Regsiter(&types.ServiceRuntime{Name: "api", Host: "localhost", MappedPorts: map[string]string{"8080": "49152"}})
	if err := (&ShellExecutor{}).Execute(context.Background(), config.TestConfig{Config: map[string]any{
		"command": "printf %s-$API_PORT $API_HOST", "expectedOutput": "api-49152", "expectedExitCode": json.Number("0"),
		"env": map[string]string{"API_HOST": "${api.host}", "API_PORT": "${api.port.8080}"},
	}}, registry); err != nil {
		t.Fatalf("shell Execute() error = %v", err)
	}
	if err := (&DelayExecutor{}).Execute(context.Background(), config.TestConfig{Config: map[string]any{
		"durationMs": "1",
	}}, registry); err != nil {
		t.Fatalf("delay Execute() error = %v", err)
	}
}

func TestDatabaseConnectionStringsUseAddressableHost(t *testing.T) {
	executor := &DatabaseExecutor{}
	runtime := &types.ServiceRuntime{Name: "database", Host: "[::1]", MappedPorts: map[string]string{"3306": "33060", "5432": "54320"}}

	mysqlDSN, err := executor.buildConnectionString("mariadb", runtime, map[string]any{"database": "app"})
	if err != nil {
		t.Fatal(err)
	}
	if mysqlDSN != "root:root@tcp(127.0.0.1:33060)/app?parseTime=true&multiStatements=true" {
		t.Fatalf("unexpected MariaDB DSN %q", mysqlDSN)
	}
	if got := resolveSQLDriverName("mariadb"); got != "mysql" {
		t.Fatalf("resolveSQLDriverName(mariadb) = %q", got)
	}

	postgresDSN, err := executor.buildConnectionString("postgres", runtime, map[string]any{"database": "app"})
	if err != nil {
		t.Fatal(err)
	}
	if postgresDSN != "host=127.0.0.1 port=54320 user=postgres password=postgres dbname=app sslmode=disable" {
		t.Fatalf("unexpected Postgres DSN %q", postgresDSN)
	}
}

func TestQueueBrokerTypeAlias(t *testing.T) {
	got, err := (&QueueExecutor{}).inferBrokerType("queue", map[string]any{"brokerType": "rabbitmq"})
	if err != nil || got != "rabbitmq" {
		t.Fatalf("inferBrokerType() = (%q, %v)", got, err)
	}
}
