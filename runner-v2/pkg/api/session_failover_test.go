package api

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
)

func TestMergePersistedPlanUsesPersistedWhenRequestEmpty(t *testing.T) {
	tests, err := mergePersistedPlan(nil, `[{"name":"health","type":"http","config":{"service":"api","method":"GET","path":"/health"}}]`)
	if err != nil {
		t.Fatalf("mergePersistedPlan returned error: %v", err)
	}

	if len(tests) != 1 {
		t.Fatalf("expected 1 test, got %d", len(tests))
	}
	if tests[0].Name != "health" || tests[0].Type != "http" {
		t.Fatalf("unexpected merged test: %+v", tests[0])
	}
}

func TestRejectUnsafeResumeAllowsReplaySafeTail(t *testing.T) {
	tests := []config.TestConfig{
		{Name: "seed", Type: "database", Config: map[string]any{"query": "select 1"}},
		{Name: "verify", Type: "http", Config: map[string]any{"method": "GET"}},
	}

	if err := rejectUnsafeResume(tests, 1); err != nil {
		t.Fatalf("expected replay-safe resume, got error: %v", err)
	}
}

func TestRejectUnsafeResumeBlocksMutatingTail(t *testing.T) {
	tests := []config.TestConfig{
		{Name: "seed", Type: "database", Config: map[string]any{"query": "select 1"}},
		{Name: "mutate-cache", Type: "cache", Config: map[string]any{"operation": "set"}},
	}

	err := rejectUnsafeResume(tests, 1)
	if err == nil {
		t.Fatal("expected unsafe resume to be rejected")
	}
}
