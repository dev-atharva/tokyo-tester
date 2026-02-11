package test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type HTTPExecutor struct{}

func (e *HTTPExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	method := getStringOrDefault(testCfg.Config, "method", "GET")
	path := getStringOrDefault(testCfg.Config, "path", "/")
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok {
		return fmt.Errorf("http test requires 'service' configuration")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found: %s", serviceName)
	}

	port := getStringOrDefault(testCfg.Config, "port", "80")
	hostPort, ok := runtime.MappedPorts[port]
	if !ok {
		return fmt.Errorf("port %s not mapped for service %s", port, serviceName)
	}

	url := fmt.Sprintf("http://%s:%s%s", runtime.Host, hostPort, path)

	var body io.Reader
	if bodyStr, ok := testCfg.Config["body"].(string); ok {
		body = strings.NewReader(bodyStr)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return fmt.Errorf("failed to create request : %w", err)
	}

	if headers, ok := testCfg.Config["headers"].(map[string]any); ok {
		for key, val := range headers {
			if strval, ok := val.(string); ok {
				req.Header.Set(key, strval)
			}
		}
	}

	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed ; %w", err)
	}

	defer resp.Body.Close()

	if expectedStatus, ok := testCfg.Config["expected_status"].(int); ok {
		if resp.StatusCode != expectedStatus {
			return fmt.Errorf("expected status %d, got %d", expectedStatus, resp.StatusCode)
		}
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if expectedBody, exists := testCfg.Config["expected_body"]; exists {
		switch expected := expectedBody.(type) {
		case string:
			if !strings.Contains(string(bodyBytes), expected) {
				return fmt.Errorf("response body does not contain expected string: %s", expected)
			}
		case map[string]any:
			var actual map[string]any
			if err := json.Unmarshal(bodyBytes, &actual); err != nil {
				return fmt.Errorf("response is not valid JSON: %w", err)
			}
			for key, val := range expected {
				if actual[key] != val {
					return fmt.Errorf("expected body field %s=%v, got %v", key, val, actual[key])
				}
			}
		default:
			return fmt.Errorf("unsupported expected_body type")
		}
	}

	return nil
}
