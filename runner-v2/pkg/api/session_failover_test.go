package api

import (
	"encoding/json"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
)

func TestPersistedRetryEvidenceRoundTrips(t *testing.T) {
	want := persistedTestResult{
		Name: "health", Type: "http", Passed: true, DurationMs: 17, Recovered: true,
		Attempts: []dto.TestAttempt{
			{Attempt: 1, Outcome: "failed", DurationMs: 5, FailureClass: "transient_transport", FailureCode: "TEST_TRANSPORT_CONNECTION_RESET", RetryScheduled: true},
			{Attempt: 2, Outcome: "passed", DurationMs: 12},
		},
	}
	payload, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	var got persistedTestResult
	if err := json.Unmarshal(payload, &got); err != nil {
		t.Fatal(err)
	}
	if !got.Recovered || got.DurationMs != want.DurationMs || len(got.Attempts) != 2 || !got.Attempts[0].RetryScheduled || got.Attempts[0].FailureCode != want.Attempts[0].FailureCode {
		t.Fatalf("retry evidence changed after persistence round trip: %#v", got)
	}
}

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
