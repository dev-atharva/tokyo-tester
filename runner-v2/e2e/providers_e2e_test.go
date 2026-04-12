package e2e_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/api"
	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/testcontainers/testcontainers-go"
)

func TestProvidersAndExecutorsE2E(t *testing.T) {
	testcontainers.SkipIfProviderIsNotHealthy(t)

	handler := api.NewHandler(nil, config.AppConfig{
		ProvisionTimeoutSec:      900,
		TestRunTimeoutSec:        1800,
		CleanupTimeoutSec:        180,
		OperationQueueTimeoutSec: 30,
		MaxConcurrentProvision:   1,
		MaxConcurrentTestRuns:    1,
		MaxConcurrentCleanup:     1,
	})

	server := httptest.NewServer(api.NewRouter(handler, nil, false))
	defer server.Close()

	testCases := []struct {
		name        string
		servicesReq dto.CreateServicesRequest
		testsReq    dto.RunTestRequest
	}{
		{
			name: "postgres database",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "postgres",
					Type: "postgres",
					Env: map[string]string{
						"POSTGRES_DB":       "appdb",
						"POSTGRES_USER":     "tester",
						"POSTGRES_PASSWORD": "secret",
					},
					InitScripts: []string{
						"CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT); INSERT INTO users (name) VALUES ('Alice'), ('Bob');",
					},
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{{
					Name: "postgres-count",
					Type: "database",
					Config: map[string]any{
						"service":         "postgres",
						"driver":          "postgres",
						"database":        "appdb",
						"user":            "tester",
						"password":        "secret",
						"query":           "SELECT COUNT(*) AS count FROM users",
						"expected_result": 2,
					},
				}},
			},
		},
		{
			name: "mysql database",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "mysql",
					Type: "mysql",
					Env: map[string]string{
						"MYSQL_DB":       "appdb",
						"MYSQL_USER":     "tester",
						"MYSQL_PASSWORD": "secret",
					},
					InitScripts: []string{
						"CREATE TABLE widgets (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(64)); INSERT INTO widgets (name) VALUES ('gear'), ('bolt');",
					},
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{{
					Name: "mysql-count",
					Type: "database",
					Config: map[string]any{
						"service":         "mysql",
						"driver":          "mysql",
						"database":        "appdb",
						"user":            "tester",
						"password":        "secret",
						"query":           "SELECT COUNT(*) AS count FROM widgets",
						"expected_result": 2,
					},
				}},
			},
		},
		{
			name: "mariadb database",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "mariadb",
					Type: "mariadb",
					Env: map[string]string{
						"MARIA_DB":       "appdb",
						"MARIA_USER":     "tester",
						"MARIA_PASSWORD": "secret",
					},
					InitScripts: []string{
						"CREATE TABLE orders (id INT AUTO_INCREMENT PRIMARY KEY, status VARCHAR(32)); INSERT INTO orders (status) VALUES ('ready'), ('ready');",
					},
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{{
					Name: "mariadb-count",
					Type: "database",
					Config: map[string]any{
						"service":         "mariadb",
						"driver":          "mariadb",
						"database":        "appdb",
						"user":            "tester",
						"password":        "secret",
						"query":           "SELECT COUNT(*) AS count FROM orders",
						"expected_result": 2,
					},
				}},
			},
		},
		{
			name: "redis cache",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "redis",
					Type: "redis",
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{
					{
						Name: "redis-set",
						Type: "cache",
						Config: map[string]any{
							"service":    "redis",
							"cache_type": "redis",
							"operation":  "set",
							"key":        "smoke:redis",
							"value":      "ready",
						},
					},
					{
						Name: "redis-get",
						Type: "cache",
						Config: map[string]any{
							"service":        "redis",
							"cache_type":     "redis",
							"operation":      "get",
							"key":            "smoke:redis",
							"expected_value": "ready",
						},
					},
				},
			},
		},
		{
			name: "memcached cache",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "memcached",
					Type: "memcached",
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{
					{
						Name: "memcached-set",
						Type: "cache",
						Config: map[string]any{
							"service":    "memcached",
							"cache_type": "memcached",
							"operation":  "set",
							"key":        "smoke:memcached",
							"value":      "warm",
						},
					},
					{
						Name: "memcached-get",
						Type: "cache",
						Config: map[string]any{
							"service":        "memcached",
							"cache_type":     "memcached",
							"operation":      "get",
							"key":            "smoke:memcached",
							"expected_value": "warm",
						},
					},
				},
			},
		},
		{
			name: "kafka queue",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "kafka",
					Type: "kafka",
					InitScripts: []string{
						"kafka-topics --bootstrap-server localhost:9092 --create --if-not-exists --topic smoke-events --partitions 1 --replication-factor 1",
					},
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{{
					Name: "kafka-roundtrip",
					Type: "queue",
					Config: map[string]any{
						"service":     "kafka",
						"broker_type": "kafka",
						"operation":   "produce_and_consume",
						"topic":       "smoke-events",
						"message":     "hello-kafka",
						"partition":   0,
						"timeout":     20,
					},
				}},
			},
		},
		{
			name: "rabbitmq queue",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "rabbitmq",
					Type: "rabbitmq",
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{{
					Name: "rabbitmq-roundtrip",
					Type: "queue",
					Config: map[string]any{
						"service":     "rabbitmq",
						"broker_type": "rabbitmq",
						"operation":   "produce_and_consume",
						"topic":       "smoke-queue",
						"message":     "hello-rabbitmq",
						"timeout":     10,
					},
				}},
			},
		},
		{
			name: "mongodb document",
			servicesReq: dto.CreateServicesRequest{
				Services: []dto.ServiceDTO{{
					Name: "mongodb",
					Type: "mongodb",
					Env: map[string]string{
						"MONGO_INITDB_DATABASE":      "appdb",
						"MONGO_INITDB_ROOT_USERNAME": "admin",
						"MONGO_INITDB_ROOT_PASSWORD": "admin",
					},
				}},
			},
			testsReq: dto.RunTestRequest{
				Tests: []dto.TestDTO{
					{
						Name: "mongodb-insert",
						Type: "document",
						Config: map[string]any{
							"service":    "mongodb",
							"database":   "appdb",
							"collection": "users",
							"operation":  "insert_one",
							"document": map[string]any{
								"email": "alice@example.com",
								"name":  "Alice",
								"role":  "admin",
							},
						},
					},
					{
						Name: "mongodb-find-one",
						Type: "document",
						Config: map[string]any{
							"service":    "mongodb",
							"database":   "appdb",
							"collection": "users",
							"operation":  "find_one",
							"filter": map[string]any{
								"email": "alice@example.com",
							},
							"expected_document": map[string]any{
								"name": "Alice",
								"role": "admin",
							},
						},
					},
				},
			},
		},
	}

	client := &http.Client{Timeout: 30 * time.Minute}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			runProviderScenario(t, client, server.URL, tc.servicesReq, tc.testsReq)
		})
	}
}

func runProviderScenario(t *testing.T, client *http.Client, baseURL string, servicesReq dto.CreateServicesRequest, testsReq dto.RunTestRequest) {
	t.Helper()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	var createResp dto.CreateServicesResponse
	doJSONRequest(ctx, t, client, http.MethodPost, baseURL+"/services", servicesReq, &createResp)

	if createResp.SessionID == "" {
		t.Fatal("expected session_id from /services")
	}

	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cleanupCancel()

		req, err := http.NewRequestWithContext(cleanupCtx, http.MethodDelete, baseURL+"/cleanup/"+createResp.SessionID, nil)
		if err != nil {
			t.Fatalf("build cleanup request: %v", err)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("cleanup request failed: %v", err)
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("cleanup failed with %d: %s", resp.StatusCode, string(body))
		}
	})

	var testResp dto.RunTestReponse
	doJSONRequest(ctx, t, client, http.MethodPost, baseURL+"/tests/"+createResp.SessionID, testsReq, &testResp)

	if testResp.Summary.Failed != 0 {
		t.Fatalf("expected all tests to pass, got summary %+v and results %+v", testResp.Summary, testResp.Results)
	}

	if len(testResp.Results) != len(testsReq.Tests) {
		t.Fatalf("expected %d results, got %d", len(testsReq.Tests), len(testResp.Results))
	}

	for _, result := range testResp.Results {
		if !result.Passed {
			t.Fatalf("test %q failed unexpectedly: %s", result.Name, result.Error)
		}
	}
}

func doJSONRequest(ctx context.Context, t *testing.T, client *http.Client, method, url string, payload any, out any) {
	t.Helper()

	var body io.Reader
	if payload != nil {
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatalf("marshal request payload: %v", err)
		}
		body = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		t.Fatalf("build request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s failed: %v", method, url, err)
	}
	defer resp.Body.Close()

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}

	if resp.StatusCode >= 300 {
		t.Fatalf("%s %s returned %d: %s", method, url, resp.StatusCode, string(responseBody))
	}

	if out == nil {
		return
	}

	if err := json.Unmarshal(responseBody, out); err != nil {
		t.Fatalf("decode response body: %v; raw=%s", err, string(responseBody))
	}
}

func TestProvidersWorkflowBundleE2E(t *testing.T) {
	testcontainers.SkipIfProviderIsNotHealthy(t)

	handler := api.NewHandler(nil, config.AppConfig{
		ProvisionTimeoutSec:      900,
		TestRunTimeoutSec:        1800,
		CleanupTimeoutSec:        180,
		OperationQueueTimeoutSec: 30,
		MaxConcurrentProvision:   1,
		MaxConcurrentTestRuns:    1,
		MaxConcurrentCleanup:     1,
	})

	server := httptest.NewServer(api.NewRouter(handler, nil, false))
	defer server.Close()

	bundle := map[string]any{
		"schemaVersion": 1,
		"kind":          "cots.workflow-bundle",
		"workflow": map[string]any{
			"name": "provider-bundle-e2e",
			"nodes": []map[string]any{
				{
					"id": "redis-node",
					"data": map[string]any{
						"label": "redis",
						"service": map[string]any{
							"type":        "redis",
							"env":         []any{},
							"ports":       []any{},
							"initScripts": []any{},
						},
					},
				},
				{
					"id": "rabbitmq-node",
					"data": map[string]any{
						"label": "rabbitmq",
						"service": map[string]any{
							"type":        "rabbitmq",
							"env":         []any{},
							"ports":       []any{},
							"initScripts": []any{},
						},
					},
				},
				{
					"id": "mongodb-node",
					"data": map[string]any{
						"label": "mongodb",
						"service": map[string]any{
							"type": "mongodb",
							"env": []map[string]any{
								{"key": "MONGO_INITDB_DATABASE", "value": "appdb"},
								{"key": "MONGO_INITDB_ROOT_USERNAME", "value": "admin"},
								{"key": "MONGO_INITDB_ROOT_PASSWORD", "value": "admin"},
							},
							"ports":       []any{},
							"initScripts": []any{},
						},
					},
				},
			},
			"edges": []any{},
		},
		"scenarios": []map[string]any{
			{
				"name": "redis queue document smoke",
				"tests": []map[string]any{
					{
						"id":             "redis-set",
						"name":           "redis-set",
						"type":           "cache",
						"targetServices": []string{"redis"},
						"cacheConfig": map[string]any{
							"service":        "redis",
							"cacheType":      "redis",
							"operation":      "set",
							"key":            "bundle:redis",
							"value":          "ok",
							"expectedExists": nil,
						},
					},
					{
						"id":             "rabbitmq-roundtrip",
						"name":           "rabbitmq-roundtrip",
						"type":           "queue",
						"targetServices": []string{"rabbitmq"},
						"queueConfig": map[string]any{
							"service":    "rabbitmq",
							"brokerType": "rabbitmq",
							"operation":  "produce_and_consume",
							"topic":      "bundle-queue",
							"message":    "bundle-rabbitmq",
							"timeout":    10,
						},
					},
					{
						"id":             "mongodb-insert",
						"name":           "mongodb-insert",
						"type":           "document",
						"targetServices": []string{"mongodb"},
						"documentConfig": map[string]any{
							"service":    "mongodb",
							"database":   "appdb",
							"collection": "users",
							"operation":  "insert_one",
							"document": map[string]any{
								"email": "bundle@example.com",
								"name":  "Bundle User",
							},
						},
					},
					{
						"id":             "mongodb-find",
						"name":           "mongodb-find",
						"type":           "document",
						"targetServices": []string{"mongodb"},
						"documentConfig": map[string]any{
							"service":    "mongodb",
							"database":   "appdb",
							"collection": "users",
							"operation":  "find_one",
							"filter":     map[string]any{"email": "bundle@example.com"},
							"expectedDocument": map[string]any{
								"name": "Bundle User",
							},
						},
					},
				},
				"testOrder": []string{"redis-set", "rabbitmq-roundtrip", "mongodb-insert", "mongodb-find"},
			},
		},
	}

	var response dto.WorkflowBundleRunResponse
	doJSONRequest(context.Background(), t, &http.Client{Timeout: 30 * time.Minute}, http.MethodPost, server.URL+"/workflow-bundles/run", bundle, &response)

	if !response.Success {
		t.Fatalf("expected workflow bundle to pass, got %+v", response)
	}

	if response.Summary.FailedScenarios != 0 || response.Summary.FailedTests != 0 {
		t.Fatalf("unexpected bundle summary: %+v", response.Summary)
	}
}
