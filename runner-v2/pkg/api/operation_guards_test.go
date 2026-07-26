package api

import (
	"context"
	"testing"
	"time"
)

func TestAcquireDurableSlotWaitsForCapacityWithoutDeadline(t *testing.T) {
	slots := make(chan struct{}, 1)
	slots <- struct{}{}
	result := make(chan error, 1)
	go func() {
		release, err := acquireDurableSlot(context.Background(), slots)
		if release != nil {
			release()
		}
		result <- err
	}()
	select {
	case err := <-result:
		t.Fatalf("durable wait returned before capacity was available: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	<-slots
	select {
	case err := <-result:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("durable wait did not acquire released capacity")
	}
}

func TestAcquireDurableSlotStopsOnCancellation(t *testing.T) {
	slots := make(chan struct{}, 1)
	slots <- struct{}{}
	ctx, cancel := context.WithCancelCause(context.Background())
	expected := context.Canceled
	cancel(expected)
	if _, err := acquireDurableSlot(ctx, slots); err != expected {
		t.Fatalf("unexpected cancellation cause: %v", err)
	}
}
