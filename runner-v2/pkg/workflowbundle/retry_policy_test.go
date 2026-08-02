package workflowbundle

import (
	"strings"
	"testing"
)

func TestRetryPolicyRoundTripAndValidation(t *testing.T) {
	payload := `{
  "schemaVersion": 2,
  "kind": "cots.workflow-bundle",
  "workflow": {
    "name": "retry-policy",
    "nodes": [{"id":"api","data":{"label":"api","service":{"type":"generic","image":"api:test","ports":[{"hostPort":"","containerPort":"8080"}]}}}],
    "edges": []
  },
  "scenarios": [{
    "name":"smoke",
    "tests":[{"id":"call","name":"call","type":"http","targetServices":["api"],"retryPolicy":{"mode":"transient","idempotencyConfirmed":true},"httpConfig":{"method":"POST","path":"/payments","port":"8080"}}],
    "testOrder":["call"]
  }]
}`
	bundle, err := Decode(strings.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	translated, err := bundle.TranslateScenario(bundle.Scenarios[0])
	if err != nil {
		t.Fatal(err)
	}
	if !translated.Tests[0].RetryPolicy.IdempotencyConfirmed || translated.Tests[0].RetryPolicy.EffectiveMode() != "transient" {
		t.Fatalf("retry policy was not translated: %#v", translated.Tests[0].RetryPolicy)
	}
}

func TestRetryPolicyRejectsContradictoryConfiguration(t *testing.T) {
	payload := `{
  "schemaVersion": 2,
  "kind": "cots.workflow-bundle",
  "workflow": {
    "name": "retry-policy",
    "nodes": [{"id":"api","data":{"label":"api","service":{"type":"generic","image":"api:test","ports":[{"hostPort":"","containerPort":"8080"}]}}}],
    "edges": []
  },
  "scenarios": [{
    "name":"smoke",
    "tests":[{"id":"call","name":"call","type":"http","targetServices":["api"],"retryPolicy":{"mode":"never","idempotencyConfirmed":true},"httpConfig":{"method":"POST","path":"/payments","port":"8080"}}],
    "testOrder":["call"]
  }]
}`
	if _, err := Decode(strings.NewReader(payload)); err == nil || !strings.Contains(err.Error(), "cannot confirm idempotency") {
		t.Fatalf("expected contradictory retry policy error, got %v", err)
	}
}
