package dockerhealth

import (
	"context"
	"fmt"

	"github.com/docker/docker/client"
)

// Validate checks that the configured Docker daemon is reachable before the
// runner accepts workflow work.
func Validate(ctx context.Context) error {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return fmt.Errorf("create Docker client: %w", err)
	}
	defer cli.Close()

	if _, err := cli.Ping(ctx); err != nil {
		return fmt.Errorf("ping Docker daemon: %w", err)
	}
	return nil
}
