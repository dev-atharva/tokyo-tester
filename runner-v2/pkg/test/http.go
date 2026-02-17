package test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"reflect"
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

	if expectedRaw, ok := testCfg.Config["expected_status"]; ok {
		var expectedStatus int

		switch v := expectedRaw.(type) {
		case int:
			expectedStatus = v
		case float64:
			expectedStatus = int(v)
		default:
			return fmt.Errorf("expected_status must be a number, got %T", expectedRaw)
		}

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
			for key, expectedVal := range expected {
				actualVal, exists := actual[key]
				if !exists {
					return fmt.Errorf("expected body field %s missing in response", key)
				}

				expectedVal = normalizeNumber(expectedVal)
				actualVal = normalizeNumber(actualVal)

				if !reflect.DeepEqual(actualVal, expectedVal) {
					return fmt.Errorf("expected body field %s=%v (%T), got %v (%T)", key, expectedVal, expectedVal, actualVal, actualVal)
				}
			}
		default:
			return fmt.Errorf("unsupported expected_body type")
		}
	}

	return nil
}

func normalizeNumber(v any) any {
	switch n := v.(type) {
	case int:
		return float64(n)
	case int32:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return v
	}
}
