package mcpserver

import (
	"strings"
	"testing"
	"time"
)

func TestValidationReceiptBindsExactBundleAndExpires(t *testing.T) {
	server := newTestServer(t)
	now := time.Date(2026, 7, 26, 12, 0, 0, 0, time.UTC)
	bundle := map[string]any{"schemaVersion": 2.0, "kind": "cots.workflow-bundle", "workflow": map[string]any{"name": "orders"}}
	receipt, err := server.issueValidationReceipt(bundle, now)
	if err != nil {
		t.Fatal(err)
	}
	if err := server.verifyValidationReceipt(receipt, bundle, now.Add(time.Minute)); err != nil {
		t.Fatalf("valid receipt was rejected: %v", err)
	}
	modified := map[string]any{"schemaVersion": 2.0, "kind": "cots.workflow-bundle", "workflow": map[string]any{"name": "payments"}}
	if err := server.verifyValidationReceipt(receipt, modified, now.Add(time.Minute)); err == nil || !strings.Contains(err.Error(), "does not match") {
		t.Fatalf("modified bundle error = %v", err)
	}
	if err := server.verifyValidationReceipt(receipt, bundle, now.Add(validationReceiptTTL)); err == nil || !strings.Contains(err.Error(), "expired") {
		t.Fatalf("expired receipt error = %v", err)
	}
}

func TestMutationToolsRequireValidationReceipt(t *testing.T) {
	for _, name := range []string{"tokyo_import_workflow", "tokyo_run_workflow"} {
		message := validateToolArguments(name, map[string]any{
			"bundle":         map[string]any{},
			"idempotencyKey": "stable-key",
		})
		if !strings.Contains(message, "validationReceipt") {
			t.Fatalf("%s validation error = %q", name, message)
		}
	}
}
