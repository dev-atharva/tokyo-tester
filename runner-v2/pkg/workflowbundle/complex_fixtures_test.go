package workflowbundle

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func loadRepositoryBundle(t *testing.T, name string) *Bundle {
	t.Helper()
	path := filepath.Join("..", "..", "..", name)
	payload, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var bundle Bundle
	if err := json.Unmarshal(payload, &bundle); err != nil {
		t.Fatal(err)
	}
	if err := bundle.Validate(); err != nil {
		t.Fatalf("%s is not executable: %v", name, err)
	}
	return &bundle
}

func TestComplexPaymentBundleCoversProviderAndExecutorMatrix(t *testing.T) {
	bundle := loadRepositoryBundle(t, "test-payment-platform.json")
	providerTypes := map[string]bool{}
	for _, node := range bundle.Workflow.Nodes {
		providerTypes[node.Data.Service.Type] = true
	}
	for _, providerType := range []string{"generic", "postgres", "mysql", "mariadb", "redis", "memcached", "mongodb", "rabbitmq", "kafka"} {
		if !providerTypes[providerType] {
			t.Errorf("bundle does not cover provider %q", providerType)
		}
	}

	executorTypes := map[string]bool{}
	for _, scenario := range bundle.Scenarios {
		translated, err := bundle.TranslateScenario(scenario)
		if err != nil {
			t.Fatalf("translate %q: %v", scenario.Name, err)
		}
		if len(translated.Services) == 0 || len(translated.Tests) != len(scenario.Tests) {
			t.Fatalf("incomplete translation for %q", scenario.Name)
		}
		for _, test := range scenario.Tests {
			executorTypes[test.Type] = true
		}
	}
	for _, executorType := range []string{"http", "database", "document", "cache", "queue", "shell", "delay"} {
		if !executorTypes[executorType] {
			t.Errorf("bundle does not cover executor %q", executorType)
		}
	}
}

func TestPaymentResilienceBundleHasIntentionalFailureTopology(t *testing.T) {
	bundle := loadRepositoryBundle(t, "test-payment-resilience.json")
	if len(bundle.Scenarios) != 3 {
		t.Fatalf("expected three resilience scenarios, got %d", len(bundle.Scenarios))
	}
	if bundle.Scenarios[1].TestOrder[1] != "after-failure" {
		t.Fatal("continuation test must run after the intentional failure")
	}
	if bundle.Scenarios[2].Tests[0].TargetServices[0] != "broken_payment_service" {
		t.Fatal("provisioning failure scenario must target the crashing service")
	}
}
