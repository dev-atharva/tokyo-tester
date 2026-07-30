package predefined

import (
	"context"
	"fmt"

	"github.com/testcontainers/testcontainers-go"
)

func cloneEnvironment(environment map[string]string) map[string]string {
	cloned := make(map[string]string, len(environment)+2)
	for key, value := range environment {
		cloned[key] = value
	}
	return cloned
}

func executeServiceInitScripts(ctx context.Context, container testcontainers.Container, scripts []string) error {
	for index, script := range scripts {
		exitCode, output, err := container.Exec(ctx, []string{"sh", "-c", script})
		if err != nil {
			return fmt.Errorf("init script %d failed: %w", index, err)
		}
		if exitCode != 0 {
			return fmt.Errorf("init script %d exited with code %d: %s", index, exitCode, output)
		}
	}
	return nil
}
