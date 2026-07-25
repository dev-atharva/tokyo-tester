package registry

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/docker/docker/api/types/image"
	dockerregistry "github.com/docker/docker/api/types/registry"
)

type ImagePuller interface {
	ImagePull(ctx context.Context, image string, options image.PullOptions) (io.ReadCloser, error)
}

type pullMessage struct {
	Error       string `json:"error"`
	ErrorDetail *struct {
		Message string `json:"message"`
	} `json:"errorDetail"`
}

// PullImage authenticates the actual Docker image-pull request. It intentionally
// does not call docker login or mutate process-wide Docker credential state, so
// concurrent workflows can safely use different credentials for the same host.
func PullImage(ctx context.Context, puller ImagePuller, imageName string, reg *config.RegistryConfig) (string, error) {
	resolved, err := ResolveImageNameChecked(imageName, reg)
	if err != nil {
		return "", err
	}
	if reg == nil {
		return resolved, nil
	}

	registryHost, err := NormalizeRegistryHost(reg.URL)
	if err != nil {
		return "", err
	}
	options := image.PullOptions{}
	if reg.AuthType != "" && reg.AuthType != "none" {
		auth, err := registryAuth(registryHost, reg)
		if err != nil {
			return "", err
		}
		encoded, err := json.Marshal(auth)
		if err != nil {
			return "", fmt.Errorf("encode registry authentication: %w", err)
		}
		options.RegistryAuth = base64.URLEncoding.EncodeToString(encoded)
	}

	stream, err := puller.ImagePull(ctx, resolved, options)
	if err != nil {
		return "", fmt.Errorf("pull image %q from registry %q: %s", resolved, registryHost, redactRegistryError(err.Error(), reg))
	}
	defer stream.Close()

	decoder := json.NewDecoder(stream)
	for {
		var message pullMessage
		if err := decoder.Decode(&message); err != nil {
			if err == io.EOF {
				break
			}
			return "", fmt.Errorf("read registry pull response for %q: %w", resolved, err)
		}
		if message.Error != "" || (message.ErrorDetail != nil && message.ErrorDetail.Message != "") {
			detail := message.Error
			if message.ErrorDetail != nil && message.ErrorDetail.Message != "" {
				detail = message.ErrorDetail.Message
			}
			return "", fmt.Errorf("pull image %q from registry %q: %s", resolved, registryHost, redactRegistryError(detail, reg))
		}
	}
	return resolved, nil
}

func registryAuth(registryHost string, reg *config.RegistryConfig) (dockerregistry.AuthConfig, error) {
	auth := dockerregistry.AuthConfig{ServerAddress: registryHost}
	switch reg.AuthType {
	case "basic":
		if strings.TrimSpace(reg.Username) == "" || reg.Password == "" {
			return auth, fmt.Errorf("registry username and password or pull token are required")
		}
		auth.Username = strings.TrimSpace(reg.Username)
		auth.Password = reg.Password
	case "token":
		if reg.Token == "" {
			return auth, fmt.Errorf("Docker registry identity token is required")
		}
		auth.IdentityToken = reg.Token
	default:
		return auth, fmt.Errorf("unsupported registry authentication type %q", reg.AuthType)
	}
	return auth, nil
}

func redactRegistryError(message string, reg *config.RegistryConfig) string {
	for _, secret := range []string{reg.Password, reg.Token} {
		if secret != "" {
			message = strings.ReplaceAll(message, secret, "[REDACTED]")
		}
	}
	return message
}
