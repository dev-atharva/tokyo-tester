package e2e_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/api"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/client"
	"github.com/testcontainers/testcontainers-go"
)

func TestComplexPaymentFixturesE2E(t *testing.T) {
	if os.Getenv("RUN_COMPLEX_PAYMENT_E2E") != "1" {
		t.Skip("set RUN_COMPLEX_PAYMENT_E2E=1 or run make test-complex-e2e")
	}
	testcontainers.SkipIfProviderIsNotHealthy(t)

	handler := api.NewHandler(nil, config.AppConfig{
		ProvisionTimeoutSec: 900, TestRunTimeoutSec: 1800, CleanupTimeoutSec: 180,
		OperationQueueTimeoutSec: 60, MaxConcurrentProvision: 2,
		MaxConcurrentTestRuns: 2, MaxConcurrentCleanup: 2,
	})
	server := httptest.NewServer(api.NewRouter(handler, nil, false))
	defer server.Close()

	t.Run("all-green provider matrix", func(t *testing.T) {
		response := executeRepositoryBundle(t, server.URL, "test-payment-platform.json")
		if !response.Success || response.Summary.FailedTests != 0 || response.Summary.PassedScenarios != 2 {
			t.Fatalf("passing payment bundle failed: %+v", response)
		}
		assertBundleResourcesRemoved(t, response)
	})

	t.Run("intentional resilience failures", func(t *testing.T) {
		response := executeRepositoryBundle(t, server.URL, "test-payment-resilience.json")
		if response.Success || response.Summary.PassedScenarios != 1 || response.Summary.FailedScenarios != 2 {
			t.Fatalf("unexpected resilience summary: %+v", response.Summary)
		}
		if len(response.Scenarios[1].Results) != 2 || response.Scenarios[1].Results[0].Passed || !response.Scenarios[1].Results[1].Passed {
			t.Fatalf("tests did not continue after the intentional failure: %+v", response.Scenarios[1].Results)
		}
		if response.Summary.RetriedTests != 1 {
			t.Fatalf("expected exactly one retried test, got summary %+v", response.Summary)
		}
		recovered := response.Scenarios[0].Results[2]
		if !recovered.Passed || !recovered.Recovered || len(recovered.Attempts) != 2 || recovered.Attempts[0].Outcome != "failed" || !recovered.Attempts[0].RetryScheduled || recovered.Attempts[1].Outcome != "passed" {
			t.Fatalf("transient GET did not preserve its recovered attempt history: %+v", recovered)
		}
		for _, scenario := range response.Scenarios {
			for _, result := range scenario.Results {
				if len(result.Attempts) > 2 {
					t.Fatalf("test %q exceeded the two-attempt contract: %+v", result.Name, result.Attempts)
				}
			}
		}
		assertBundleResourcesRemoved(t, response)
	})
}

func executeRepositoryBundle(t *testing.T, serverURL, name string) dto.WorkflowBundleRunResponse {
	t.Helper()
	path := filepath.Join("..", "..", name)
	payload, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer payload.Close()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodPost, serverURL+"/workflow-bundles/run", payload)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 45 * time.Minute}
	response, err := client.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("bundle returned HTTP %d", response.StatusCode)
	}
	var result dto.WorkflowBundleRunResponse
	if err := json.NewDecoder(response.Body).Decode(&result); err != nil {
		t.Fatal(err)
	}
	return result
}

func assertBundleResourcesRemoved(t *testing.T, response dto.WorkflowBundleRunResponse) {
	t.Helper()
	docker, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		t.Fatal(err)
	}
	defer docker.Close()

	for _, scenario := range response.Scenarios {
		if scenario.SessionID == "" {
			continue
		}
		filter := filters.NewArgs(filters.Arg("label", provider.LabelBackendSessionID+"="+scenario.SessionID))
		containers, err := docker.ContainerList(context.Background(), container.ListOptions{All: true, Filters: filter})
		if err != nil {
			t.Fatal(err)
		}
		networks, err := docker.NetworkList(context.Background(), network.ListOptions{Filters: filter})
		if err != nil {
			t.Fatal(err)
		}
		if len(containers) != 0 || len(networks) != 0 {
			t.Fatalf("session %s leaked %d containers and %d networks", scenario.SessionID, len(containers), len(networks))
		}
	}
}
