package api

import (
	"context"
	"fmt"
	"time"
)

func (h *Handler) acquireSlot(ctx context.Context, slots chan struct{}, operation string) (func(), error) {
	queueCtx, cancel := context.WithTimeout(ctx, h.queueTimeout)
	defer cancel()

	select {
	case slots <- struct{}{}:
		return func() { <-slots }, nil
	case <-queueCtx.Done():
		return nil, fmt.Errorf("%s queue wait exceeded %s", operation, h.queueTimeout)
	}
}

func withOperationTimeout(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	if timeout <= 0 {
		return context.WithCancel(parent)
	}
	return context.WithTimeout(parent, timeout)
}
