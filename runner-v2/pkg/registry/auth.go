package registry

import (
	"context"
	"fmt"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/docker/api/types/registry"
	"github.com/docker/docker/client"
)

// Authenticate to custom regsitry with docker SDK
func AuthenticateRegistry(ctx context.Context, dockerClient *client.Client, reg *config.RegistryConfig) error {

	//no registry is configured case
	if reg == nil || reg.URL == "" {
		return nil
	}

	if reg.AuthType == "none" || reg.AuthType == "" {
		return nil
	}

	authConfig := registry.AuthConfig{
		ServerAddress: reg.URL,
	}

	switch reg.AuthType {
	case "basic":
		if reg.Username == "" || reg.Password == "" {
			return fmt.Errorf("username and password is required for basic auth")
		}
		authConfig.Username = reg.Username
		authConfig.Password = reg.Password
	case "token":
		if reg.Token == "" {
			return fmt.Errorf("token is required for token auth")
		}
		authConfig.IdentityToken = reg.Token
	default:
		return fmt.Errorf("unsupported auth type : %s supported auth types are basic,token,none", reg.AuthType)
	}
	_, err := dockerClient.RegistryLogin(ctx, authConfig)
	if err != nil {
		return fmt.Errorf("failed to authenticate with registry %s : %w", reg.URL, err)
	}
	return nil
}
