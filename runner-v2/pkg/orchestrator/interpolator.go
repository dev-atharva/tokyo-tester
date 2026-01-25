package orchestrator

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/dev-atharva/cots/pkg/types"
)

// Stores runtime info for all services
type RuntimeRegsitry struct {
	services map[string]*types.ServiceRuntime
}

func NewRuntimeRegistry() *RuntimeRegsitry {
	return &RuntimeRegsitry{
		services: make(map[string]*types.ServiceRuntime),
	}
}

func (r *RuntimeRegsitry) Regsiter(runtime *types.ServiceRuntime) {
	r.services[runtime.Name] = runtime
}

func (r *RuntimeRegsitry) Get(name string) (*types.ServiceRuntime, bool) {
	runtime, ok := r.services[name]
	return runtime, ok
}

// Resolvs the envirnmnet variable references in format ${SERVICE_NAME.field}
// Supports fields : host,port,env.VAR_NAME
func (r *RuntimeRegsitry) InterpolateEnvVars(envVars map[string]string) (map[string]string, error) {
	result := make(map[string]string)

	varPattern := regexp.MustCompile(`\$\{([^}]+)\}`)
	for key, value := range envVars {
		resolved := value

		//Find all variables in the value
		matches := varPattern.FindAllStringSubmatch(value, -1)
		for _, match := range matches {
			if len(matches) < 2 {
				continue
			}
			varRef := match[1] //eg. "postgres.host" or "postgres.port.5432"
			replacement, err := r.resolveReference(varRef)
			if err != nil {
				return nil, fmt.Errorf("failed to resolve ${%s} in %s: %w", varRef, key, err)
			}
			resolved = strings.ReplaceAll(resolved, match[0], replacement)
		}
		result[key] = resolved
	}
	return result, nil
}

func (r *RuntimeRegsitry) resolveReference(ref string) (string, error) {
	parts := strings.SplitN(ref, ".", 3)
	if len(parts) < 2 {
		return "", fmt.Errorf("invalid reference form,at : %s (expected SERVICE.field)", ref)
	}
	serviceName := parts[0]
	field := parts[1]

	runtime, ok := r.Get(serviceName)
	if !ok {
		return "", fmt.Errorf("service not found: %s", serviceName)
	}

	switch field {
	case "host":
		if runtime.Host == "" {
			return "", fmt.Errorf("host not available for service: %s", serviceName)
		}
		return runtime.Host, nil
	case "port":
		if len(parts) < 3 {
			return "", fmt.Errorf("port reference requires container port : %s.port.CONTAINER_PORT", serviceName)
		}
		containerPort := parts[2]
		hostPort, ok := runtime.MappedPorts[containerPort]
		if !ok {
			return "", fmt.Errorf("port %s not mapped for service : %s", containerPort, serviceName)
		}
		return hostPort, nil
	case "env":
		if len(parts) < 3 {
			return "", fmt.Errorf("env reference requires variable name : %s.env.VAR_NAME", serviceName)
		}
		varName := parts[2]
		value, ok := runtime.EnvVars[varName]
		if !ok {
			return "", fmt.Errorf("environment variable %s not found for service : %s", varName, serviceName)
		}
		return value, nil
	default:
		return "", fmt.Errorf("unknown field: %s (supported: host,port,env)", field)
	}
}
