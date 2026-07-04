package types

import (
	"fmt"
	"net"
	"net/url"
	"strings"
)

// ServiceRuntime holds runtime information about the running service
type ServiceRuntime struct {
	Name        string
	ContainerID string
	Host        string
	MappedPorts map[string]string // contrainer port -> host port
	EnvVars     map[string]string
}

// AddressableHost returns a stable host for connections made by the runner.
func AddressableHost(host string) string {
	host = strings.TrimSpace(host)
	if strings.HasPrefix(host, "[") && strings.HasSuffix(host, "]") {
		host = strings.TrimSuffix(strings.TrimPrefix(host, "["), "]")
	}
	if strings.EqualFold(host, "localhost") {
		return "127.0.0.1"
	}
	if ip := net.ParseIP(host); ip != nil && (ip.IsLoopback() || ip.IsUnspecified()) {
		return "127.0.0.1"
	}
	return host
}

func JoinHostPort(host, port string) string {
	return net.JoinHostPort(AddressableHost(host), port)
}

func NormalizeHostPort(address string) (string, error) {
	host, port, err := net.SplitHostPort(address)
	if err != nil {
		return "", err
	}
	return JoinHostPort(host, port), nil
}

func NormalizeURLHost(rawURL string) (string, error) {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return "", err
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("URL has no host")
	}
	port := parsed.Port()
	if port == "" {
		parsed.Host = AddressableHost(parsed.Hostname())
	} else {
		parsed.Host = JoinHostPort(parsed.Hostname(), port)
	}
	return parsed.String(), nil
}

func (r *ServiceRuntime) Endpoint(containerPort string) (string, error) {
	port, ok := r.MappedPorts[containerPort]
	if !ok || port == "" {
		return "", fmt.Errorf("port %s is not mapped for service %s", containerPort, r.Name)
	}
	return JoinHostPort(r.Host, port), nil
}
