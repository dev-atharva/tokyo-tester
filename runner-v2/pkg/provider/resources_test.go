package provider

import (
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/docker/api/types/container"
)

func TestResourceHostConfigModifierAppliesHardLimits(t *testing.T) {
	hostConfig := &container.HostConfig{}
	ResourceHostConfigModifier(config.ContainerResourceLimits{
		MemoryBytes: 512 * 1024 * 1024,
		NanoCPUs:    750_000_000,
		PIDs:        128,
	})(hostConfig)

	if hostConfig.Memory != 512*1024*1024 || hostConfig.MemorySwap != hostConfig.Memory {
		t.Fatalf("unexpected memory limits: %+v", hostConfig.Resources)
	}
	if hostConfig.NanoCPUs != 750_000_000 {
		t.Fatalf("unexpected CPU limit: %d", hostConfig.NanoCPUs)
	}
	if hostConfig.PidsLimit == nil || *hostConfig.PidsLimit != 128 {
		t.Fatalf("unexpected PID limit: %v", hostConfig.PidsLimit)
	}
}
