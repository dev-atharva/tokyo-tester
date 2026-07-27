package test

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/session"
)

func TestInterpolateTestConfigRunSuffix(t *testing.T) {
	sess := &session.Session{
		ID: "backend-session-id",
		Execution: &session.ExecutionContext{
			WorkflowRunID: "12345678-90ab-cdef-1234-567890abcdef",
		},
	}

	config := map[string]any{
		"key": "tokyo:${tokyo.run_suffix}:sample",
		"nested": map[string]any{
			"topic": "tokyo-${tokyo.run_suffix}-sample",
		},
	}

	got, err := InterpolateTestConfig(config, sess)
	if err != nil {
		t.Fatalf("InterpolateTestConfig() error = %v", err)
	}

	if got["key"] != "tokyo:1234567890ab:sample" {
		t.Fatalf("key = %q, want %q", got["key"], "tokyo:1234567890ab:sample")
	}
	nested := got["nested"].(map[string]any)
	if nested["topic"] != "tokyo-1234567890ab-sample" {
		t.Fatalf("topic = %q, want %q", nested["topic"], "tokyo-1234567890ab-sample")
	}
}

func TestInterpolateTestConfigRunSuffixFallsBackToSessionID(t *testing.T) {
	sess := &session.Session{ID: "session-abcdef"}

	got, err := InterpolateTestConfig(map[string]any{
		"key": "${tokyo.run_suffix}",
	}, sess)
	if err != nil {
		t.Fatalf("InterpolateTestConfig() error = %v", err)
	}

	if got["key"] != "sessionabcde" {
		t.Fatalf("key = %q, want %q", got["key"], "sessionabcde")
	}
}

func TestInterpolateTestConfigRunSuffixRequiresSession(t *testing.T) {
	_, err := InterpolateTestConfig(map[string]any{
		"key": "${tokyo.run_suffix}",
	}, nil)
	if err == nil {
		t.Fatal("InterpolateTestConfig() error = nil, want an unavailable suffix error")
	}
}
