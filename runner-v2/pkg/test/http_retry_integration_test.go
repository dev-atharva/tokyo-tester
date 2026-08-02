package test

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/types"
)

func TestHTTPRetryAgainstResetConnection(t *testing.T) {
	for _, tt := range []struct {
		name            string
		method          string
		confirmed       bool
		resets          int32
		wantRequests    int32
		wantRecovered   bool
		wantAttempts    int
		wantExecutionOK bool
	}{
		{name: "safe GET recovers", method: http.MethodGet, resets: 1, wantRequests: 2, wantRecovered: true, wantAttempts: 2, wantExecutionOK: true},
		{name: "POST does not retry by default", method: http.MethodPost, resets: 1, wantRequests: 1, wantAttempts: 1},
		{name: "confirmed POST recovers", method: http.MethodPost, confirmed: true, resets: 1, wantRequests: 2, wantRecovered: true, wantAttempts: 2, wantExecutionOK: true},
		{name: "two resets exhaust GET", method: http.MethodGet, resets: 2, wantRequests: 2, wantAttempts: 2},
	} {
		t.Run(tt.name, func(t *testing.T) {
			var requests atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				if requests.Add(1) <= tt.resets {
					hijacker, ok := w.(http.Hijacker)
					if !ok {
						t.Error("response writer does not support hijacking")
						return
					}
					connection, _, err := hijacker.Hijack()
					if err != nil {
						t.Errorf("hijack: %v", err)
						return
					}
					_ = connection.Close()
					return
				}
				w.WriteHeader(http.StatusOK)
			}))
			defer server.Close()

			host, port, err := net.SplitHostPort(strings.TrimPrefix(server.URL, "http://"))
			if err != nil {
				t.Fatal(err)
			}
			registry := orchestrator.NewRuntimeRegistry()
			registry.Regsiter(&types.ServiceRuntime{
				Name: "api", Host: host, MappedPorts: map[string]string{"8080": port},
			})
			testConfig := config.TestConfig{
				Name: "health", Type: "http", TargetServices: []string{"api"},
				RetryPolicy: config.TestRetryPolicy{IdempotencyConfirmed: tt.confirmed},
				Config: map[string]any{
					"service": "api", "port": "8080", "method": tt.method, "path": "/", "expected_status": 200,
				},
			}

			report, executeErr := ExecuteWithRetry(context.Background(), &HTTPExecutor{}, testConfig, registry, RetryOptions{
				Backoff: func() time.Duration { return 0 },
			})
			if (executeErr == nil) != tt.wantExecutionOK {
				t.Fatalf("execution error=%v, want success=%v", executeErr, tt.wantExecutionOK)
			}
			if requests.Load() != tt.wantRequests || report.Recovered != tt.wantRecovered || len(report.Attempts) != tt.wantAttempts {
				t.Fatalf("requests=%d report=%#v", requests.Load(), report)
			}
		})
	}
}
