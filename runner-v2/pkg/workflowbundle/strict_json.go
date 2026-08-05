package workflowbundle

import (
	"encoding/json"
	"fmt"
)

func rejectUnknownBundleFields(raw []byte) error {
	var root map[string]any
	if err := json.Unmarshal(raw, &root); err != nil {
		return fmt.Errorf("invalid workflow bundle JSON: %w", err)
	}
	if err := rejectUnknown(root, "/", "schemaVersion", "kind", "workflow", "scenarios"); err != nil {
		return err
	}
	schemaVersion, _ := root["schemaVersion"].(float64)
	workflow, _ := root["workflow"].(map[string]any)
	if workflow != nil {
		if err := rejectUnknown(workflow, "/workflow", "name", "description", "nodes", "edges"); err != nil {
			return err
		}
		for index, item := range asJSONArray(workflow["nodes"]) {
			node, _ := item.(map[string]any)
			data, _ := node["data"].(map[string]any)
			service, _ := data["service"].(map[string]any)
			if service != nil {
				path := fmt.Sprintf("/workflow/nodes/%d/data/service", index)
				if err := rejectUnknown(service, path, "type", "image", "command", "ports", "env", "waitStratergy", "initScripts", "mockServer", "registry"); err != nil {
					return err
				}
				for portIndex, value := range asJSONArray(service["ports"]) {
					port, _ := value.(map[string]any)
					if err := rejectUnknown(port, fmt.Sprintf("%s/ports/%d", path, portIndex), "id", "hostPort", "containerPort"); err != nil {
						return err
					}
				}
				for envIndex, value := range asJSONArray(service["env"]) {
					env, _ := value.(map[string]any)
					if err := rejectUnknown(env, fmt.Sprintf("%s/env/%d", path, envIndex), "id", "key", "value"); err != nil {
						return err
					}
				}
				if strategy, _ := service["waitStratergy"].(map[string]any); strategy != nil {
					if err := rejectUnknown(strategy, path+"/waitStratergy", "enabled", "type", "target", "timeout"); err != nil {
						return err
					}
				}
				for scriptIndex, value := range asJSONArray(service["initScripts"]) {
					script, _ := value.(map[string]any)
					if err := rejectUnknown(script, fmt.Sprintf("%s/initScripts/%d", path, scriptIndex), "id", "order", "script", "description"); err != nil {
						return err
					}
				}
				if mockServer, _ := service["mockServer"].(map[string]any); mockServer != nil {
					if err := rejectUnknown(mockServer, path+"/mockServer", "expectations"); err != nil {
						return err
					}
					for expectationIndex, value := range asJSONArray(mockServer["expectations"]) {
						expectation, _ := value.(map[string]any)
						expectationPath := fmt.Sprintf("%s/mockServer/expectations/%d", path, expectationIndex)
						if err := rejectUnknown(expectation, expectationPath, "id", "request", "response"); err != nil {
							return err
						}
						request, _ := expectation["request"].(map[string]any)
						if err := rejectUnknown(request, expectationPath+"/request", "method", "path", "headers", "body"); err != nil {
							return err
						}
						response, _ := expectation["response"].(map[string]any)
						if err := rejectUnknown(response, expectationPath+"/response", "statusCode", "headers", "body"); err != nil {
							return err
						}
					}
				}
			}
		}
		for index, item := range asJSONArray(workflow["edges"]) {
			edge, _ := item.(map[string]any)
			data, _ := edge["data"].(map[string]any)
			if data != nil {
				if err := rejectUnknown(data, fmt.Sprintf("/workflow/edges/%d/data", index), "relation", "readiness", "label", "description", "protocol", "needsReview"); err != nil {
					return err
				}
			}
		}
	}

	for scenarioIndex, item := range asJSONArray(root["scenarios"]) {
		scenario, _ := item.(map[string]any)
		path := fmt.Sprintf("/scenarios/%d", scenarioIndex)
		allowedScenarioFields := []string{"name", "description", "tests", "testOrder"}
		if int(schemaVersion) == SchemaVersionV3 {
			allowedScenarioFields = append(allowedScenarioFields, "executionModel", "environment", "steps", "stepOrder")
		}
		if err := rejectUnknown(scenario, path, allowedScenarioFields...); err != nil {
			return err
		}
		if environment, _ := scenario["environment"].(map[string]any); environment != nil {
			if err := rejectUnknown(environment, path+"/environment", "driver", "browser"); err != nil {
				return err
			}
			if browser, _ := environment["browser"].(map[string]any); browser != nil {
				if err := rejectUnknown(browser, path+"/environment/browser", "targetService", "targetPort"); err != nil {
					return err
				}
			}
		}
		for stepIndex, value := range asJSONArray(scenario["steps"]) {
			step, _ := value.(map[string]any)
			stepPath := fmt.Sprintf("%s/steps/%d", path, stepIndex)
			if err := rejectUnknown(step, stepPath, "id", "name", "kind", "timeoutMs", "action", "assertion", "control"); err != nil {
				return err
			}
			if action, _ := step["action"].(map[string]any); action != nil {
				if err := rejectUnknown(action, stepPath+"/action", "operation", "path", "locator", "value"); err != nil {
					return err
				}
				if err := rejectUnknownLocator(action["locator"], stepPath+"/action/locator"); err != nil {
					return err
				}
				if stepValue, _ := action["value"].(map[string]any); stepValue != nil {
					if err := rejectUnknown(stepValue, stepPath+"/action/value", "source", "value", "secretRef"); err != nil {
						return err
					}
				}
			}
			if assertion, _ := step["assertion"].(map[string]any); assertion != nil {
				if err := rejectUnknown(assertion, stepPath+"/assertion", "operation", "path", "query", "locator"); err != nil {
					return err
				}
				if err := rejectUnknownLocator(assertion["locator"], stepPath+"/assertion/locator"); err != nil {
					return err
				}
			}
			if control, _ := step["control"].(map[string]any); control != nil {
				if err := rejectUnknown(control, stepPath+"/control", "operation", "durationMs"); err != nil {
					return err
				}
			}
		}
		for testIndex, value := range asJSONArray(scenario["tests"]) {
			test, _ := value.(map[string]any)
			testPath := fmt.Sprintf("%s/tests/%d", path, testIndex)
			if err := rejectUnknown(test, testPath, "id", "name", "type", "targetServices", "dependsOnTestIds", "retryPolicy", "databaseConfig", "documentConfig", "httpConfig", "shellConfig", "cacheConfig", "queueConfig", "delayConfig"); err != nil {
				return err
			}
			if policy, _ := test["retryPolicy"].(map[string]any); policy != nil {
				if err := rejectUnknown(policy, testPath+"/retryPolicy", "mode", "idempotencyConfirmed"); err != nil {
					return err
				}
			}
			configs := map[string][]string{
				"databaseConfig": {"driver", "database", "user", "password", "query", "expectedResult"},
				"documentConfig": {"service", "database", "collection", "operation", "document", "filter", "update", "expectedDocument", "expectedDocuments", "expectedCount", "expectedExists"},
				"httpConfig":     {"method", "path", "port", "headers", "body", "expectedStatus", "expectedBody"},
				"shellConfig":    {"command", "env", "expectedOutput", "expectedExitCode"},
				"cacheConfig":    {"service", "cacheType", "operation", "key", "value", "expectedValue", "expectedExists", "ttl", "db", "password"},
				"queueConfig":    {"service", "brokerType", "operation", "topic", "message", "key", "partition", "timeout", "fromBeginning", "expectedCount", "expectedMessage", "expectedExists"},
				"delayConfig":    {"durationMs"},
			}
			for field, allowed := range configs {
				config, _ := test[field].(map[string]any)
				if config == nil {
					continue
				}
				if err := rejectUnknown(config, testPath+"/"+field, allowed...); err != nil {
					return err
				}
				if field == "httpConfig" {
					if expected, _ := config["expectedBody"].(map[string]any); expected != nil {
						if err := rejectUnknown(expected, testPath+"/httpConfig/expectedBody", "mode", "value"); err != nil {
							return err
						}
					}
				}
			}
		}
	}
	return nil
}

func rejectUnknownLocator(value any, path string) error {
	locator, _ := value.(map[string]any)
	if locator == nil {
		return nil
	}
	return rejectUnknown(locator, path, "strategy", "role", "name", "value", "exact")
}

func rejectUnknown(object map[string]any, path string, allowed ...string) error {
	if object == nil {
		return nil
	}
	set := make(map[string]struct{}, len(allowed))
	for _, field := range allowed {
		set[field] = struct{}{}
	}
	for field := range object {
		if _, ok := set[field]; !ok {
			return fmt.Errorf("unknown workflow bundle field %s/%s", path, field)
		}
	}
	return nil
}

func asJSONArray(value any) []any {
	items, _ := value.([]any)
	return items
}
