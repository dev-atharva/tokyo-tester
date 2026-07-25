package registry

import (
	"fmt"
	"net"
	"strconv"
	"strings"
	"unicode"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/distribution/reference"
)

// NormalizeRegistryHost validates the Docker registry server address. Registry
// hosts are host[:port] values; schemes and repository paths belong neither in
// the Docker auth server address nor in an image reference.
func NormalizeRegistryHost(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("registry host is required")
	}
	if strings.Contains(value, "://") || strings.ContainsAny(value, "/?#@") {
		return "", fmt.Errorf("registry host must contain only a hostname and optional port")
	}

	host := value
	port := ""
	if strings.HasPrefix(value, "[") || strings.Count(value, ":") == 1 {
		if parsedHost, parsedPort, err := net.SplitHostPort(value); err == nil {
			host, port = parsedHost, parsedPort
		} else if strings.Contains(value, ":") {
			return "", fmt.Errorf("registry port is invalid")
		}
	} else if strings.Count(value, ":") > 1 {
		return "", fmt.Errorf("IPv6 registry hosts must include a port and use brackets")
	}

	host = strings.ToLower(strings.TrimSpace(host))
	if !validRegistryHostname(host) {
		return "", fmt.Errorf("registry hostname is invalid")
	}
	if port == "" {
		return host, nil
	}
	portNumber, err := strconv.Atoi(port)
	if err != nil || portNumber < 1 || portNumber > 65535 {
		return "", fmt.Errorf("registry port must be between 1 and 65535")
	}
	return net.JoinHostPort(host, port), nil
}

func validRegistryHostname(host string) bool {
	if host == "localhost" || net.ParseIP(host) != nil {
		return true
	}
	if len(host) == 0 || len(host) > 253 {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, char := range label {
			if char != '-' && !unicode.IsLetter(char) && !unicode.IsDigit(char) {
				return false
			}
		}
	}
	return true
}

// ResolveImageName preserves the legacy provider helper signature. New pull
// paths must use ResolveImageNameChecked so validation errors cannot be ignored.
func ResolveImageName(imageName string, reg *config.RegistryConfig) string {
	resolved, err := ResolveImageNameChecked(imageName, reg)
	if err != nil {
		return imageName
	}
	return resolved
}

// ResolveImageNameChecked combines a registry host with an image repository
// path. Nested repository paths are preserved, for example:
// registry.example.com/team/platform/api:v1.
func ResolveImageNameChecked(imageName string, reg *config.RegistryConfig) (string, error) {
	imageName = strings.TrimSpace(imageName)
	if imageName == "" {
		return "", fmt.Errorf("container image is required")
	}
	if reg == nil || strings.TrimSpace(reg.URL) == "" {
		if _, err := reference.ParseNormalizedNamed(imageName); err != nil {
			return "", fmt.Errorf("invalid container image %q: %w", imageName, err)
		}
		return imageName, nil
	}

	registryHost, err := NormalizeRegistryHost(reg.URL)
	if err != nil {
		return "", err
	}
	if strings.Contains(imageName, "://") {
		return "", fmt.Errorf("container image must not include a URL scheme")
	}

	firstComponent := strings.SplitN(imageName, "/", 2)[0]
	hasExplicitRegistry := firstComponent == "localhost" ||
		strings.Contains(firstComponent, ".") ||
		strings.Contains(firstComponent, ":") ||
		strings.HasPrefix(firstComponent, "[")
	resolved := registryHost + "/" + strings.TrimPrefix(imageName, "/")
	if hasExplicitRegistry {
		imageRegistry, err := NormalizeRegistryHost(firstComponent)
		if err != nil {
			return "", fmt.Errorf("invalid image registry: %w", err)
		}
		if imageRegistry != registryHost {
			return "", fmt.Errorf("image registry %q does not match configured registry %q", imageRegistry, registryHost)
		}
		resolved = imageName
	}

	if _, err := reference.ParseNormalizedNamed(resolved); err != nil {
		return "", fmt.Errorf("invalid container image %q: %w", resolved, err)
	}
	return resolved, nil
}
