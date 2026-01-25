package test

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/dev-atharva/cots/pkg/session"
)

// Resolves test result references in config
// Supports: ${testName.field}, ${testName.jsonPath}, ${testName.response.id}
func InterpolateTestConfig(config map[string]any, sess *session.Session) (map[string]any, error) {
	result := make(map[string]any)
	varPattern := regexp.MustCompile(`\$\{([^}]+)\}`)

	for key, value := range config {
		switch v := value.(type) {
		case string:
			resolved := v
			matches := varPattern.FindAllStringSubmatch(v, -1)
			for _, match := range matches {
				if len(match) < 2 {
					continue
				}
				varRef := match[1]
				replacement, err := resolveTestReference(varRef, sess)
				if err != nil {
					return nil, fmt.Errorf("failed to resolve ${%s} in %s: %w", varRef, key, err)
				}
				resolved = strings.ReplaceAll(resolved, match[0], replacement)
			}
			result[key] = resolved
		case map[string]any:
			interpolated, err := InterpolateTestConfig(v, sess)
			if err != nil {
				return nil, err
			}
			result[key] = interpolated
		default:
			result[key] = value
		}
	}
	return result, nil
}

// Resolves a single test result reference
// Formats: testName.field ,testName.response.field, testName.result
func resolveTestReference(ref string, sess *session.Session) (string, error) {
	parts := strings.Split(ref, ".")
	if len(parts) < 1 {
		return "", fmt.Errorf("invalid reference format: %s", ref)
	}

	name := parts[0]

	// 1. Check if it's a service runtime
	runtime, ok := sess.Orchestrator.GetRegistry().Get(name)
	if ok {
		// Example: ${user-api.host} -> runtime.Host
		if len(parts) == 1 {
			return runtime.Host, nil //default value is host
		}
		field := parts[1]

		switch field {
		case "host":
			return runtime.Host, nil
		case "port":
			//eg. ${serviceName.port:1234}
			if len(parts) > 2 {
				containerPort := parts[2]
				hostPort, ok := runtime.MappedPorts[containerPort]
				if !ok {
					return "", fmt.Errorf("mapped port %s not found for service %s", containerPort, name)
				}
				return hostPort, nil
			}
			for _, hostPort := range runtime.MappedPorts {
				return hostPort, nil
			}
			return "", fmt.Errorf("no ports mapped for service %s", name)
		default:
			if val, ok := runtime.EnvVars[field]; ok {
				return val, nil
			}
			return "", fmt.Errorf("unknown field %s in service %s", field, name)
		}
	}

	result, ok := sess.GetTestResult(name)
	if !ok {
		return "", fmt.Errorf("test result not found: %s", name)
	}

	if len(parts) == 1 {
		return formatResult(result), nil
	}

	current := result
	for i := 1; i < len(parts); i++ {
		field := parts[i]
		var ok bool
		current, ok = navigateField(current, field)
		if !ok {
			return "", fmt.Errorf("field %s not found in test result %s", field, name)
		}
	}

	return formatResult(current), nil
}

func navigateField(data any, field string) (any, bool) {
	switch v := data.(type) {
	case map[string]any:
		val, ok := v[field]
		return val, ok
	case []any:
		if strings.HasPrefix(field, "[") && strings.HasSuffix(field, "]") {
			indexStr := strings.Trim(field, "[]")
			index, err := strconv.Atoi(indexStr)
			if err != nil || index < 0 || index >= len(v) {
				return nil, false
			}
			return v[index], true
		}
		return nil, false
	default:
		return nil, false
	}
}

func formatResult(result any) string {
	switch v := result.(type) {
	case string:
		return v
	case int, int64, float64, bool:
		return fmt.Sprintf("%v", v)
	default:
		bytes, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(bytes)
	}
}
