package workflowbundle

// Capabilities is the machine-readable authoring contract exposed to agents.
type Capabilities struct {
	SchemaVersion           int                `json:"schemaVersion"`
	PreferredSchemaVersion  int                `json:"preferredSchemaVersion"`
	AcceptedSchemaVersions  []int              `json:"acceptedSchemaVersions"`
	BundleKind              string             `json:"bundleKind"`
	ScenarioExecutionModels []string           `json:"scenarioExecutionModels"`
	Journey                 *JourneyCapability `json:"journey,omitempty"`
	ServiceTypes            []string           `json:"serviceTypes"`
	TestTypes               []TestCapability   `json:"testTypes"`
	EdgeRelations           []string           `json:"edgeRelations"`
	EdgeReadiness           []string           `json:"edgeReadiness"`
	AuthoringRules          []string           `json:"authoringRules"`
	ResourceURIs            []string           `json:"resourceUris"`
	Limits                  map[string]int     `json:"limits"`
}

type JourneyCapability struct {
	Drivers           []string `json:"drivers"`
	StepKinds         []string `json:"stepKinds"`
	BrowserActions    []string `json:"browserActions"`
	BrowserAssertions []string `json:"browserAssertions"`
	Controls          []string `json:"controls"`
	LocatorStrategies []string `json:"locatorStrategies"`
	ValueSources      []string `json:"valueSources"`
}

type TestCapability struct {
	Type           string              `json:"type"`
	ConfigField    string              `json:"configField"`
	RequiredFields []string            `json:"requiredFields"`
	AllowedValues  map[string][]string `json:"allowedValues,omitempty"`
}

func AgentCapabilities() Capabilities {
	return Capabilities{
		SchemaVersion:           PreferredSchemaVersion,
		PreferredSchemaVersion:  PreferredSchemaVersion,
		AcceptedSchemaVersions:  []int{SchemaVersion, SchemaVersionV3},
		BundleKind:              BundleKind,
		ScenarioExecutionModels: []string{ExecutionModelLegacyTests, ExecutionModelJourney},
		Journey: &JourneyCapability{
			Drivers:           []string{"browser"},
			StepKinds:         []string{"action", "assertion", "control"},
			BrowserActions:    []string{"navigate", "fill", "click"},
			BrowserAssertions: []string{"url", "visible"},
			Controls:          []string{"delay"},
			LocatorStrategies: []string{"role", "label", "text", "testId"},
			ValueSources:      []string{"literal", "run-secret"},
		},
		ServiceTypes: []string{"generic", "postgres", "mysql", "mariadb", "redis", "memcached", "mongodb", "rabbitmq", "kafka", "nginx", "mockserver"},
		TestTypes: []TestCapability{
			{Type: "http", ConfigField: "httpConfig", RequiredFields: []string{"method", "path", "port"}, AllowedValues: map[string][]string{"method": {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}}},
			{Type: "database", ConfigField: "databaseConfig", RequiredFields: []string{"driver", "database", "query"}, AllowedValues: map[string][]string{"driver": {"postgres", "mysql", "mariadb"}}},
			{Type: "document", ConfigField: "documentConfig", RequiredFields: []string{"service", "database", "collection", "operation"}, AllowedValues: map[string][]string{"operation": {"insert_one", "find_one", "find_many", "update_one", "delete_one", "count_documents", "exists"}}},
			{Type: "cache", ConfigField: "cacheConfig", RequiredFields: []string{"service", "cacheType", "operation"}, AllowedValues: map[string][]string{"cacheType": {"redis", "memcached"}, "operation": {"ping", "set", "get", "exists", "delete", "del"}}},
			{Type: "queue", ConfigField: "queueConfig", RequiredFields: []string{"service", "brokerType", "operation"}, AllowedValues: map[string][]string{"brokerType": {"kafka", "rabbitmq"}, "operation": {"produce", "consume", "produce_and_consume", "check_topic", "list_topics"}}},
			{Type: "shell", ConfigField: "shellConfig", RequiredFields: []string{"command"}},
			{Type: "delay", ConfigField: "delayConfig", RequiredFields: []string{"durationMs"}},
		},
		EdgeRelations: []string{"calls", "reads", "writes", "publishes", "consumes"},
		EdgeReadiness: []string{"none", "source_requires_target", "target_requires_source"},
		AuthoringRules: []string{
			"Inspect every relevant repository before authoring; ask targeted questions for missing evidence.",
			"Send only compact summaries to MCP; never send source files, raw manifests, logs, or secrets.",
			"Review complex or multi-repo plans with tokyo_review_workflow_plan before authoring the bundle.",
			"Use container ports and validated sanitized service labels in tests.",
			"Keep waitStratergy spelling in workflow JSON for schema version 2.",
			"Use schema version 3 with an explicit executionModel for browser journeys; v2 scenarios normalize to legacy-tests.",
			"AI clients may configure secretRef names but must never submit or request runtime secret values.",
			"Define MockServer request/response expectations on mockserver services; verify them with ordinary HTTP tests on container port 1080.",
		},
		ResourceURIs: []string{
			"tokyo://authoring",
			"tokyo://scenario-patterns",
			"tokyo://quality-rubric",
			"tokyo://capabilities",
		},
		Limits: map[string]int{"maxBundleBytes": 10 << 20, "maxReviewResponseWarnings": 8},
	}
}
