package workflowbundle

// Capabilities is the machine-readable authoring contract exposed to agents.
type Capabilities struct {
	SchemaVersion          int              `json:"schemaVersion"`
	AcceptedSchemaVersions []int            `json:"acceptedSchemaVersions"`
	BundleKind             string           `json:"bundleKind"`
	ServiceTypes           []string         `json:"serviceTypes"`
	TestTypes              []TestCapability `json:"testTypes"`
	EdgeRelations          []string         `json:"edgeRelations"`
	EdgeReadiness          []string         `json:"edgeReadiness"`
	Limits                 map[string]int   `json:"limits"`
}

type TestCapability struct {
	Type           string   `json:"type"`
	ConfigField    string   `json:"configField"`
	RequiredFields []string `json:"requiredFields"`
}

func AgentCapabilities() Capabilities {
	return Capabilities{
		SchemaVersion:          SchemaVersion,
		AcceptedSchemaVersions: []int{legacySchemaVersion, SchemaVersion},
		BundleKind:             BundleKind,
		ServiceTypes:           []string{"generic", "postgres", "mysql", "mariadb", "redis", "memcached", "mongodb", "rabbitmq", "kafka"},
		TestTypes: []TestCapability{
			{Type: "http", ConfigField: "httpConfig", RequiredFields: []string{"method", "path", "port"}},
			{Type: "database", ConfigField: "databaseConfig", RequiredFields: []string{"driver", "database", "user", "password", "query"}},
			{Type: "document", ConfigField: "documentConfig", RequiredFields: []string{"service", "database", "collection", "operation"}},
			{Type: "cache", ConfigField: "cacheConfig", RequiredFields: []string{"service", "cacheType", "operation"}},
			{Type: "queue", ConfigField: "queueConfig", RequiredFields: []string{"service", "brokerType", "operation"}},
			{Type: "shell", ConfigField: "shellConfig", RequiredFields: []string{"command"}},
			{Type: "delay", ConfigField: "delayConfig", RequiredFields: []string{"durationMs"}},
		},
		EdgeRelations: []string{"calls", "reads", "writes", "publishes", "consumes"},
		EdgeReadiness: []string{"none", "source_requires_target", "target_requires_source"},
		Limits:        map[string]int{"maxBundleBytes": 10 << 20},
	}
}
