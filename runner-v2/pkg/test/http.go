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

type HTTPExecutor struct {
	client *http.Client
}

func (e *HTTPExecutor) Execute(ctx context.Context, testCfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	method, err := getStringOrDefault(testCfg.Config, "method", "GET")
	if err != nil {
		return err
	}
	path, err := getStringOrDefault(testCfg.Config, "path", "/")
	if err != nil {
		return err
	}
	serviceName, ok := testCfg.Config["service"].(string)
	if !ok {
		return fmt.Errorf("http test requires 'service' configuration")
	}

	runtime, ok := registry.Get(serviceName)
	if !ok {
		return fmt.Errorf("service not found: %s", serviceName)
	}

	port, err := getStringOrDefault(testCfg.Config, "port", "80")
	if err != nil {
		return err
	}
	endpoint, err := runtime.Endpoint(port)
	if err != nil {
		return err
	}

	url := fmt.Sprintf("http://%s%s", endpoint, path)

	var body io.Reader
	if bodyStr, ok := testCfg.Config["body"].(string); ok {
		body = strings.NewReader(bodyStr)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return fmt.Errorf("failed to create request : %w", err)
	}

	headers, _, err := getStringMap(testCfg.Config, "headers")
	if err != nil {
		return err
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}

	client := e.client
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed ; %w", err)
	}

	defer resp.Body.Close()

	if expectedStatus, found, err := getInt64Config(testCfg.Config, "expected_status"); err != nil {
		return err
	} else if found {
		if resp.StatusCode != int(expectedStatus) {
			return fmt.Errorf("expected status %d, got %d", expectedStatus, resp.StatusCode)
		}
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	expectedBody, exists, err := lookupConfigValue(testCfg.Config, "expected_body")
	if err != nil {
		return err
	}
	if exists {
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
	case json.Number:
		if parsed, err := n.Float64(); err == nil {
			return parsed
		}
		return n
	default:
		return v
	}
}
