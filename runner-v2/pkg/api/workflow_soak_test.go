//go:build soak

package api

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
)

// TestLongRunningSessionLeaseSoak is opt-in because its purpose is to expose
// timer, connection-pool, and lease-renewal failures over real wall-clock time.
// Set TOKYO_SOAK_DURATION=24h for the release-candidate gate.
func TestLongRunningSessionLeaseSoak(t *testing.T) {
	duration := 10 * time.Minute
	if configured := os.Getenv("TOKYO_SOAK_DURATION"); configured != "" {
		parsed, err := time.ParseDuration(configured)
		if err != nil {
			t.Fatalf("invalid TOKYO_SOAK_DURATION: %v", err)
		}
		duration = parsed
	}
	handler, _, client, _ := newWorkflowAPIHarness(t)
	now := time.Now().UTC()
	session := &db.Session{
		ID: "session-lease-soak", ProjectID: "project-contract-1", WorkflowRunID: "run-lease-soak",
		WorkflowID: "workflow-contract-1", ScenarioID: "scenario-lease-soak", Status: "running",
		OwnerID: handler.ownerID, HeartbeatAt: &now, LeaseExpiresAt: &now,
		Version: 1, CreatedAt: now, UpdatedAt: now,
	}
	if err := client.UpsertSession(context.Background(), session); err != nil {
		t.Fatal(err)
	}
	handler.sessionHeartbeatInterval = 100 * time.Millisecond
	handler.leaseDuration = time.Second
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go handler.heartbeatSession(ctx, session.ID)

	deadline := time.Now().Add(duration)
	for time.Now().Before(deadline) {
		time.Sleep(250 * time.Millisecond)
		stored, err := client.GetSession(context.Background(), session.ID)
		if err != nil {
			t.Fatal(err)
		}
		if stored.LeaseExpiresAt == nil || !stored.LeaseExpiresAt.After(time.Now()) {
			t.Fatalf("session lease expired during soak: %+v", stored)
		}
	}
}
