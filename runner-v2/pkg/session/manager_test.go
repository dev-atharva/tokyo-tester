package session

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/provider"
)

func TestDeleteWithContextRetainsSessionWhenCleanupFails(t *testing.T) {
	manager := NewManager()
	manager.cleanupSession = func(context.Context, *Session) error {
		return errors.New("docker cleanup failed")
	}
	manager.Register("session-1", orchestrator.NewOrchestrator(provider.NewRegistry()), nil)

	err := manager.DeleteWithContext(context.Background(), "session-1")
	if err == nil {
		t.Fatal("expected cleanup failure")
	}
	if _, lookupErr := manager.Get("session-1"); lookupErr != nil {
		t.Fatalf("failed cleanup removed the session needed for retry: %v", lookupErr)
	}
}

func TestCleanupOfOneSessionDoesNotBlockOtherSessions(t *testing.T) {
	manager := NewManager()
	started := make(chan struct{})
	release := make(chan struct{})
	manager.cleanupSession = func(_ context.Context, sess *Session) error {
		if sess.ID == "first" {
			close(started)
			<-release
		}
		return nil
	}
	manager.Register("first", orchestrator.NewOrchestrator(provider.NewRegistry()), nil)
	manager.Register("second", orchestrator.NewOrchestrator(provider.NewRegistry()), nil)

	done := make(chan error, 1)
	go func() { done <- manager.DeleteWithContext(context.Background(), "first") }()
	<-started

	lookupDone := make(chan error, 1)
	go func() {
		_, err := manager.Get("second")
		lookupDone <- err
	}()
	select {
	case err := <-lookupDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cleanup of one session blocked access to another session")
	}

	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
}
