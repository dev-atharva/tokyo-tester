package mcpserver

func workflowBundleToolSchema() map[string]any {
	stringValue := func(description string) map[string]any {
		return map[string]any{"type": "string", "minLength": 1, "description": description}
	}
	service := map[string]any{
		"type":                 "object",
		"description":          "Container service definition. generic services require image; provider services may use Tokyo Tester defaults.",
		"required":             []string{"type"},
		"additionalProperties": false,
		"properties": map[string]any{
			"type":          map[string]any{"type": "string", "enum": []string{"generic", "postgres", "mysql", "mariadb", "redis", "memcached", "mongodb", "rabbitmq", "kafka", "nginx", "mockserver"}, "description": "Service provider type."},
			"image":         stringValue("Required image reference for generic services; optional override for providers."),
			"command":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "Container command and arguments."},
			"ports":         map[string]any{"type": "array", "description": "Container ports. hostPort may be empty for automatic allocation.", "items": map[string]any{"type": "object", "required": []string{"hostPort", "containerPort"}, "additionalProperties": false, "properties": map[string]any{"id": map[string]any{"type": "string"}, "hostPort": map[string]any{"type": "string"}, "containerPort": stringValue("Container port from 1 to 65535.")}}},
			"env":           map[string]any{"type": "array", "description": "Non-secret environment variables. Runtime references use ${service.host} or ${service.env.KEY}.", "items": map[string]any{"type": "object", "required": []string{"key", "value"}, "additionalProperties": false, "properties": map[string]any{"id": map[string]any{"type": "string"}, "key": stringValue("Environment variable name."), "value": map[string]any{"type": "string", "description": "Non-secret value or runtime reference."}}}},
			"waitStratergy": map[string]any{"type": "object", "description": "Readiness strategy; preserve the waitStratergy spelling.", "required": []string{"enabled", "type"}, "additionalProperties": false, "properties": map[string]any{"enabled": map[string]any{"type": "boolean"}, "type": map[string]any{"type": "string", "enum": []string{"log", "port", "exec"}}, "target": map[string]any{"type": "string"}, "timeout": map[string]any{"type": "integer", "minimum": 0, "maximum": 3600}}},
			"initScripts":   map[string]any{"type": "array", "items": map[string]any{"type": "object", "required": []string{"order", "script"}, "additionalProperties": false, "properties": map[string]any{"id": map[string]any{"type": "string"}, "order": map[string]any{"type": "integer"}, "script": stringValue("Initialization script content."), "description": map[string]any{"type": "string"}}}},
			"mockServer": map[string]any{
				"type": "object", "description": "MockServer expectations loaded before the service becomes ready.", "required": []string{"expectations"}, "additionalProperties": false,
				"properties": map[string]any{"expectations": map[string]any{
					"type": "array", "items": map[string]any{
						"type": "object", "required": []string{"id", "request", "response"}, "additionalProperties": false,
						"properties": map[string]any{
							"id": stringValue("Stable unique expectation id."),
							"request": map[string]any{"type": "object", "required": []string{"method", "path"}, "additionalProperties": false, "properties": map[string]any{
								"method": map[string]any{"type": "string", "enum": []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}},
								"path":   map[string]any{"type": "string", "pattern": "^/"}, "headers": map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}}, "body": map[string]any{"type": "string"},
							}},
							"response": map[string]any{"type": "object", "required": []string{"statusCode"}, "additionalProperties": false, "properties": map[string]any{
								"statusCode": map[string]any{"type": "integer", "minimum": 100, "maximum": 599}, "headers": map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}}, "body": map[string]any{"type": "string"},
							}},
						},
					},
				}},
			},
		},
	}
	configs := workflowTestConfigSchemas()
	test := map[string]any{
		"type":                 "object",
		"required":             []string{"id", "name", "type", "targetServices"},
		"additionalProperties": false,
		"properties": map[string]any{
			"id":               stringValue("Stable unique test id."),
			"name":             stringValue("Unique behavior-oriented test name."),
			"type":             map[string]any{"type": "string", "enum": []string{"http", "database", "document", "cache", "queue", "shell", "delay"}, "description": "Test executor type; include exactly the matching *Config field."},
			"targetServices":   map[string]any{"type": "array", "minItems": 1, "uniqueItems": true, "description": "Validated sanitized service labels.", "items": map[string]any{"type": "string", "minLength": 1}},
			"dependsOnTestIds": map[string]any{"type": "array", "uniqueItems": true, "items": map[string]any{"type": "string", "minLength": 1}},
			"retryPolicy": map[string]any{
				"type": "object", "description": "Optional transient retry policy. Omission enables one safe automatic retry.", "required": []string{"mode"}, "additionalProperties": false,
				"properties": map[string]any{
					"mode":                 map[string]any{"type": "string", "enum": []string{"transient", "never"}},
					"idempotencyConfirmed": map[string]any{"type": "boolean", "const": true, "description": "Explicit assertion that a state-changing operation may be executed twice."},
				},
			},
			"httpConfig":     configs["httpConfig"],
			"databaseConfig": configs["databaseConfig"],
			"documentConfig": configs["documentConfig"],
			"cacheConfig":    configs["cacheConfig"],
			"queueConfig":    configs["queueConfig"],
			"shellConfig":    configs["shellConfig"],
			"delayConfig":    configs["delayConfig"],
		},
	}
	locator := map[string]any{
		"oneOf": []any{
			map[string]any{"type": "object", "required": []string{"strategy", "role", "name"}, "additionalProperties": false, "properties": map[string]any{"strategy": map[string]any{"type": "string", "const": "role"}, "role": stringValue("ARIA role."), "name": stringValue("Accessible name."), "exact": map[string]any{"type": "boolean"}}},
			map[string]any{"type": "object", "required": []string{"strategy", "value"}, "additionalProperties": false, "properties": map[string]any{"strategy": map[string]any{"type": "string", "enum": []string{"label", "text", "testId"}}, "value": stringValue("Label, visible text, or test id."), "exact": map[string]any{"type": "boolean"}}},
		},
	}
	stepValue := map[string]any{
		"oneOf": []any{
			map[string]any{"type": "object", "required": []string{"source", "value"}, "additionalProperties": false, "properties": map[string]any{"source": map[string]any{"type": "string", "const": "literal"}, "value": map[string]any{"type": "string"}}},
			map[string]any{"type": "object", "required": []string{"source", "secretRef"}, "additionalProperties": false, "properties": map[string]any{"source": map[string]any{"type": "string", "const": "run-secret"}, "secretRef": stringValue("Reference name only. Runtime secret values are human-supplied and must never be sent through MCP.")}},
		},
	}
	stepBase := func(kind string, configName string, config map[string]any) map[string]any {
		return map[string]any{
			"type": "object", "required": []string{"id", "name", "kind", configName}, "additionalProperties": false,
			"properties": map[string]any{"id": stringValue("Stable unique step id."), "name": stringValue("Behavior-oriented step name."), "kind": map[string]any{"type": "string", "const": kind}, "timeoutMs": map[string]any{"type": "integer", "minimum": 0, "maximum": 300000}, configName: config},
		}
	}
	action := map[string]any{"oneOf": []any{
		map[string]any{"type": "object", "required": []string{"operation", "path"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "navigate"}, "path": map[string]any{"type": "string", "pattern": "^/"}}},
		map[string]any{"type": "object", "required": []string{"operation", "locator", "value"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "fill"}, "locator": locator, "value": stepValue}},
		map[string]any{"type": "object", "required": []string{"operation", "locator"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "click"}, "locator": locator}},
	}}
	assertion := map[string]any{"oneOf": []any{
		map[string]any{"type": "object", "required": []string{"operation", "path"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "url"}, "path": map[string]any{"type": "string", "pattern": "^/"}, "query": map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}}}},
		map[string]any{"type": "object", "required": []string{"operation", "locator"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "visible"}, "locator": locator}},
	}}
	control := map[string]any{"type": "object", "required": []string{"operation", "durationMs"}, "additionalProperties": false, "properties": map[string]any{"operation": map[string]any{"type": "string", "const": "delay"}, "durationMs": map[string]any{"type": "integer", "minimum": 0, "maximum": 86400000}}}
	journeyStep := map[string]any{"oneOf": []any{stepBase("action", "action", action), stepBase("assertion", "assertion", assertion), stepBase("control", "control", control)}}
	legacyScenario := map[string]any{
		"type": "object", "required": []string{"name", "tests", "testOrder"}, "additionalProperties": false,
		"properties": map[string]any{"name": stringValue("Unique behavior-oriented scenario name."), "description": map[string]any{"type": "string"}, "executionModel": map[string]any{"type": "string", "const": "legacy-tests"}, "tests": map[string]any{"type": "array", "minItems": 1, "items": test}, "testOrder": map[string]any{"type": "array", "uniqueItems": true, "items": map[string]any{"type": "string", "minLength": 1}}},
	}
	journeyScenario := map[string]any{
		"type": "object", "required": []string{"name", "executionModel", "environment", "steps", "stepOrder"}, "additionalProperties": false,
		"properties": map[string]any{
			"name": stringValue("Unique behavior-oriented scenario name."), "description": map[string]any{"type": "string"}, "executionModel": map[string]any{"type": "string", "const": "journey"},
			"environment": map[string]any{"type": "object", "required": []string{"driver", "browser"}, "additionalProperties": false, "properties": map[string]any{"driver": map[string]any{"type": "string", "const": "browser"}, "browser": map[string]any{"type": "object", "required": []string{"targetService", "targetPort"}, "additionalProperties": false, "properties": map[string]any{"targetService": stringValue("Sanitized UI service label."), "targetPort": stringValue("UI service container port.")}}}},
			"steps":       map[string]any{"type": "array", "minItems": 1, "items": journeyStep}, "stepOrder": map[string]any{"type": "array", "minItems": 1, "uniqueItems": true, "items": map[string]any{"type": "string", "minLength": 1}},
		},
	}
	return map[string]any{
		"type":                 "object",
		"description":          "Complete schemaVersion 2 or 3 cots.workflow-bundle. Use v3 for browser journeys, repository-evidenced values, and secretRef names only.",
		"required":             []string{"schemaVersion", "kind", "workflow", "scenarios"},
		"additionalProperties": false,
		"properties": map[string]any{
			"schemaVersion": map[string]any{"type": "integer", "enum": []int{2, 3}, "description": "Use 2 for legacy-only bundles and 3 when any scenario is a journey."},
			"kind":          map[string]any{"type": "string", "const": "cots.workflow-bundle", "description": "Workflow bundle kind."},
			"workflow": map[string]any{"type": "object", "required": []string{"name", "nodes", "edges"}, "additionalProperties": false, "properties": map[string]any{
				"name": stringValue("Workflow name."), "description": map[string]any{"type": "string"},
				"nodes": map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"type": "object", "required": []string{"id", "data"}, "properties": map[string]any{"id": stringValue("Stable unique node id."), "data": map[string]any{"type": "object", "required": []string{"label", "service"}, "properties": map[string]any{"label": stringValue("Unique human label; its sanitized value is used by tests."), "service": service}}}}},
				"edges": map[string]any{"type": "array", "items": map[string]any{"type": "object", "required": []string{"source", "target", "data"}, "properties": map[string]any{"id": map[string]any{"type": "string"}, "source": stringValue("Existing source node id."), "target": stringValue("Existing target node id."), "data": map[string]any{"type": "object", "required": []string{"relation", "readiness"}, "additionalProperties": false, "properties": map[string]any{"relation": map[string]any{"type": "string", "enum": []string{"calls", "reads", "writes", "publishes", "consumes"}}, "readiness": map[string]any{"type": "string", "enum": []string{"none", "source_requires_target", "target_requires_source"}}, "label": map[string]any{"type": "string"}, "description": map[string]any{"type": "string"}, "protocol": map[string]any{"type": "string"}, "needsReview": map[string]any{"type": "boolean"}}}}}},
			}},
			"scenarios": map[string]any{"type": "array", "minItems": 1, "items": map[string]any{"oneOf": []any{legacyScenario, journeyScenario}}},
		},
	}
}

func workflowTestConfigSchemas() map[string]map[string]any {
	object := func(description string, required []string, properties map[string]any) map[string]any {
		return map[string]any{"type": "object", "description": description, "required": required, "additionalProperties": false, "properties": properties}
	}
	text := func(required bool) map[string]any {
		schema := map[string]any{"type": "string"}
		if required {
			schema["minLength"] = 1
		}
		return schema
	}
	stringMap := func() map[string]any {
		return map[string]any{"type": "object", "additionalProperties": map[string]any{"type": "string"}}
	}
	anyValue := map[string]any{}
	return map[string]map[string]any{
		"httpConfig": object("HTTP request and assertions against a target service container port.", []string{"method", "path", "port"}, map[string]any{
			"method": map[string]any{"type": "string", "enum": []string{"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}}, "path": map[string]any{"type": "string", "pattern": "^/"}, "port": map[string]any{"type": "string", "pattern": `^[0-9]{1,5}(/tcp)?$`}, "headers": stringMap(), "body": text(false), "expectedStatus": map[string]any{"type": "integer", "minimum": 100, "maximum": 599}, "expectedBody": object("Stable body assertion.", []string{"mode", "value"}, map[string]any{"mode": map[string]any{"type": "string", "enum": []string{"contains", "json_partial", "json"}}, "value": anyValue}),
		}),
		"databaseConfig": object("SQL query and optional expected result. Credentials must be test-safe.", []string{"driver", "database", "query"}, map[string]any{
			"driver": map[string]any{"type": "string", "enum": []string{"postgres", "mysql", "mariadb"}}, "database": text(true), "user": text(false), "password": map[string]any{"type": "string", "description": "Test-safe credential only; never a production secret."}, "query": text(true), "expectedResult": anyValue,
		}),
		"documentConfig": object("Document-store operation and assertions.", []string{"service", "database", "collection", "operation"}, map[string]any{
			"service": text(true), "database": text(true), "collection": text(true), "operation": map[string]any{"type": "string", "enum": []string{"insert_one", "find_one", "find_many", "update_one", "delete_one", "count_documents", "exists"}}, "document": map[string]any{"type": "object"}, "filter": map[string]any{"type": "object"}, "update": map[string]any{"type": "object"}, "expectedDocument": map[string]any{"type": "object"}, "expectedDocuments": map[string]any{"type": "array", "items": map[string]any{"type": "object"}}, "expectedCount": map[string]any{"type": "integer", "minimum": 0}, "expectedExists": map[string]any{"type": "boolean"},
		}),
		"cacheConfig": object("Redis or Memcached operation and assertions.", []string{"service", "cacheType", "operation"}, map[string]any{
			"service": text(true), "cacheType": map[string]any{"type": "string", "enum": []string{"redis", "memcached"}}, "operation": map[string]any{"type": "string", "enum": []string{"ping", "set", "get", "exists", "delete", "del"}}, "key": text(false), "value": anyValue, "expectedValue": anyValue, "expectedExists": map[string]any{"type": "boolean"}, "ttl": map[string]any{"type": "integer", "minimum": 0}, "db": map[string]any{"type": "integer", "minimum": 0}, "password": map[string]any{"type": "string", "description": "Test-safe credential only; never a production secret."},
		}),
		"queueConfig": object("Kafka or RabbitMQ operation and assertions.", []string{"service", "brokerType", "operation"}, map[string]any{
			"service": text(true), "brokerType": map[string]any{"type": "string", "enum": []string{"kafka", "rabbitmq"}}, "operation": map[string]any{"type": "string", "enum": []string{"produce", "consume", "produce_and_consume", "check_topic", "list_topics"}}, "topic": text(false), "message": anyValue, "key": text(false), "partition": map[string]any{"type": "integer", "minimum": 0}, "timeout": map[string]any{"type": "integer", "minimum": 0, "maximum": 300}, "fromBeginning": map[string]any{"type": "boolean"}, "expectedCount": map[string]any{"type": "integer", "minimum": 0}, "expectedMessage": anyValue, "expectedExists": map[string]any{"type": "boolean"},
		}),
		"shellConfig": object("Shell command and optional output assertions.", []string{"command"}, map[string]any{
			"command": text(true), "env": stringMap(), "expectedOutput": text(false), "expectedExitCode": map[string]any{"type": "integer"},
		}),
		"delayConfig": object("Bounded delay for evidenced asynchronous transitions.", []string{"durationMs"}, map[string]any{
			"durationMs": map[string]any{"type": "integer", "minimum": 1, "maximum": 86400000},
		}),
	}
}

func reviewItemSchemas() map[string]map[string]any {
	array := func(description string, required []string, properties map[string]any) map[string]any {
		return map[string]any{"type": "array", "description": description, "items": map[string]any{"type": "object", "required": required, "additionalProperties": false, "properties": properties}}
	}
	stringList := func(description string) map[string]any {
		return map[string]any{"type": "array", "description": description, "items": map[string]any{"type": "string", "minLength": 1}, "uniqueItems": true}
	}
	text := func(description string) map[string]any {
		return map[string]any{"type": "string", "minLength": 1, "description": description}
	}
	return map[string]map[string]any{
		"repositories":     array("Every repository available to the agent; summaries only.", []string{"path", "services", "evidence"}, map[string]any{"path": text("Local repository path."), "services": stringList("Services owned by the repository."), "evidence": stringList("Files proving build/runtime behavior."), "gaps": stringList("Missing repositories or unresolved evidence.")}),
		"serviceInventory": array("Application and infrastructure services derived from evidence.", []string{"name", "type", "repository", "runtimeEvidence"}, map[string]any{"name": text("Stable service name."), "type": text("generic or supported provider type."), "repository": text("Owning repository path."), "image": map[string]any{"type": "string", "description": "Evidenced image reference."}, "buildEvidence": stringList("Dockerfile/build evidence."), "runtimeEvidence": stringList("Ports, command, readiness, and environment evidence."), "gaps": stringList("Unresolved service facts.")}),
		"dependencyMap":    array("Evidenced service relationships and startup readiness.", []string{"source", "target", "relation", "readiness", "evidence"}, map[string]any{"source": text("Source service."), "target": text("Target service."), "relation": text("calls, reads, writes, publishes, or consumes."), "readiness": text("none, source_requires_target, or target_requires_source."), "evidence": stringList("Files or configuration proving the relationship.")}),
		"scenarioMatrix":   array("Behavior scenarios with evidence and explicit gaps.", []string{"scenario", "purpose", "servicesTouched", "evidence"}, map[string]any{"scenario": text("Behavior-oriented scenario name."), "purpose": text("User-visible behavior proved."), "entrypoint": map[string]any{"type": "string"}, "servicesTouched": stringList("Services used by the scenario."), "infraAssertions": stringList("Direct infrastructure side effects asserted."), "evidence": stringList("Routes, specs, tests, or fixtures supporting expectations."), "gaps": stringList("Unknown values that must be resolved before authoring.")}),
	}
}

func genericToolOutputSchema() map[string]any {
	return map[string]any{"type": "object", "additionalProperties": true, "description": "Structured Tokyo Tester result mirrored byte-for-byte in content."}
}

func validationReceiptSchema() map[string]any {
	return map[string]any{"type": "string", "minLength": 32, "description": "Expiring receipt returned by tokyo_validate_workflow for this exact normalized bundle. Never reuse it with a modified bundle."}
}
