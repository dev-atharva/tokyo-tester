package test

import (
	"strings"
	"testing"
)

func predefinedSkipIfDockerUnavailablePanic(t *testing.T) {
	t.Helper()

	if recovered := recover(); recovered != nil {
		if err, ok := recovered.(error); ok {
			predefinedSkipIfDockerUnavailableInner(t, err)
		}
		t.Skipf("docker unavailable for integration test: %v", recovered)
	}
}

func predefinedSkipIfDockerUnavailableInner(t *testing.T, err error) {
	t.Helper()

	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "docker") ||
		strings.Contains(lower, "daemon") ||
		strings.Contains(lower, "socket") ||
		strings.Contains(lower, "cannot connect") {
		t.Skipf("docker unavailable for integration test: %v", err)
	}
}
