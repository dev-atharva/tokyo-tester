package provider

import (
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/docker/api/types/container"
)

// ResourceHostConfigModifier applies runner-owned cgroup limits to every
// workflow service container, including containers created by module helpers.
func ResourceHostConfigModifier(limits config.ContainerResourceLimits) func(*container.HostConfig) {
	return func(hostConfig *container.HostConfig) {
		if limits.MemoryBytes > 0 {
			hostConfig.Resources.Memory = limits.MemoryBytes
			hostConfig.Resources.MemorySwap = limits.MemoryBytes
		}
		if limits.NanoCPUs > 0 {
			hostConfig.Resources.NanoCPUs = limits.NanoCPUs
		}
		if limits.PIDs > 0 {
			pids := limits.PIDs
			hostConfig.Resources.PidsLimit = &pids
		}
	}
}
