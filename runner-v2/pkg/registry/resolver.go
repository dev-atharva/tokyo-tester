package registry

import (
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
)

// Prefixes the image with custom registry provided in the regsitry config
func ResolveImageName(imageName string, reg *config.RegistryConfig) string {
	if reg == nil || reg.URL == "" {
		return imageName
	}

	//If there is already prefix given , then do not add prefix
	if strings.Contains(imageName, "/") && strings.Contains(strings.Split(imageName, "/")[0], ".") {
		return imageName
	}

	return strings.TrimPrefix(reg.URL, "/") + "/" + imageName
}
