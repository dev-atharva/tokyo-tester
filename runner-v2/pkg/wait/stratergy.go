package wait

import (
	"fmt"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/go-connections/nat"
	"github.com/testcontainers/testcontainers-go/wait"
)

// This creates as wait startergy
func CreateWaitStratergy(cfg config.WaitStratergyConfig) (wait.Strategy, error) {
	timeout := time.Duration(cfg.Timeout) * time.Second
	if timeout == 0 {
		timeout = 60 * time.Second
	}
	switch cfg.Type {
	case "log":
		return createLogStratergy(cfg.Target, timeout)
	case "port":
		return createPortStratergy(cfg.Target, timeout)
	case "exec":
		return createExceStratergy(cfg.Target, timeout)
	default:
		return nil, fmt.Errorf("unknkonw wait stratergy type %s", cfg.Type)
	}
}

func createLogStratergy(message string, timeout time.Duration) (wait.Strategy, error) {
	if message == "" {
		return nil, fmt.Errorf("log wait stratergy required a wait message")
	}
	return wait.ForLog(message).WithStartupTimeout(timeout), nil
}

func createPortStratergy(port string, timeout time.Duration) (wait.Strategy, error) {
	if port == "" {
		return nil, fmt.Errorf("port startegry needs the port defination")
	}
	return wait.ForListeningPort(nat.Port(port)).WithStartupTimeout(timeout), nil
}

func createExceStratergy(command string, timeout time.Duration) (wait.Strategy, error) {
	if command == "" {
		return nil, fmt.Errorf("exec wait stratergy needs command")
	}
	return wait.ForExec([]string{"sh", "-c", command}).WithStartupTimeout(timeout), nil
}
