package dto

import "github.com/dev-atharva/cots/pkg/config"

type RunTestRequest struct {
	Tests            []TestDTO            `json:"tests" validate:"required,min=1,dive"`
	ExecutionContext *ExecutionContextDTO `json:"execution_context,omitempty"`
}

type TestDTO struct {
	Name      string         `json:"name" validate:"required,min=1,max=100"`
	Type      string         `json:"type" validate:"required,oneof=database document http shell cache queue delay"`
	DependsOn []string       `json:"depends_on,omitempty"`
	Config    map[string]any `json:"config" validate:"required"`
}

type RunTestReponse struct {
	SessionID string       `json:"session_id"`
	Results   []TestResult `json:"results"`
	Summary   TestSummary  `json:"summary"`
}

type TestResult struct {
	Name          string            `json:"name"`
	Type          string            `json:"type"`
	Passed        bool              `json:"passed"`
	Error         string            `json:"error,omitempty"`
	ContainerLogs map[string]string `json:"container_logs,omitempty"`
}

type TestSummary struct {
	Total  int `json:"total"`
	Passed int `json:"passed"`
	Failed int `json:"failed"`
}

type CleanUpReponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

func (t *TestDTO) ToConfig() config.TestConfig {
	return config.TestConfig{
		Name:      t.Name,
		Type:      t.Type,
		DependsOn: t.DependsOn,
		Config:    t.Config,
	}
}

func (req *RunTestRequest) ToConfigList() []config.TestConfig {
	configs := make([]config.TestConfig, len(req.Tests))
	for i, test := range req.Tests {
		configs[i] = test.ToConfig()
	}
	return configs
}

func FromTestConfig(cfg config.TestConfig) TestDTO {
	return TestDTO{
		Name:      cfg.Name,
		Type:      cfg.Type,
		DependsOn: cfg.DependsOn,
		Config:    cfg.Config,
	}
}

type HTTPTestConfig struct {
	Method         string            `json:"method" validate:"required,oneof=GET POST PUT DELETE PATCH"`
	Path           string            `json:"path" validate:"required"`
	Service        string            `json:"service" validate:"required"`
	Port           int               `json:"port" validate:"required,min=1,max=65535"`
	Body           string            `json:"body,omitempty"`
	Headers        map[string]string `json:"headers,omitempty"`
	ExpectedStatus int               `json:"expected_status" validate:"required,min=100,max=599"`
	ExpectedBody   string            `json:"expected_body,omitempty"`
}

type DatabaseTestConfig struct {
	Query          string `json:"query" validate:"required"`
	Service        string `json:"service" validate:"required"`
	Driver         string `json:"driver" validate:"reqiured,oneof=postgres mysql sqlite"`
	Database       string `json:"database" validate:"required"`
	User           string `json:"user,omitempty"`
	Password       string `json:"password,omitempty"`
	ExpectedResult string `json:"expected_result,omitempty"`
}

type DocumentTestConfig struct {
	Service           string           `json:"service" validate:"required"`
	Database          string           `json:"database" validate:"required"`
	Collection        string           `json:"collection" validate:"required"`
	Operation         string           `json:"operation" validate:"required,oneof=insert_one find_one find_many update_one delete_one count_documents exists"`
	Document          map[string]any   `json:"document,omitempty"`
	Filter            map[string]any   `json:"filter,omitempty"`
	Update            map[string]any   `json:"update,omitempty"`
	ExpectedDocument  map[string]any   `json:"expected_document,omitempty"`
	ExpectedDocuments []map[string]any `json:"expected_documents,omitempty"`
	ExpectedCount     *int             `json:"expected_count,omitempty"`
	ExpectedExists    *bool            `json:"expected_exists,omitempty"`
}

type CacheTestConfig struct {
	Service       string `json:"service" validate:"required"`
	CacheType     string `json:"cache_type" validate:"required,oneof=redis memcached"`
	Operation     string `json:"operation" validate:"required,oneof=set get delete exists"`
	Key           string `json:"key" validate:"required"`
	Value         string `json:"value,omitempty"`
	TTL           int    `json:"ttl,omitempty" validate:"omitempty,min=1"`
	ExpectedValue string `json:"expected_value,omitempty"`
}

type QueueTestConfig struct {
	Service    string `json:"service" validate:"required"`
	Operation  string `json:"operation" validate:"required,oneof=produce consume produce_and_consume check_topic list_topics"`
	Topic      string `json:"topic,omitempty"`
	Message    string `json:"message,omitempty"`
	BrokerType string `json:"broker_type" validate:"required,oneof=kafka rabbitmq"`
	Timeout    int    `json:"timeout" validate:"required,min=1,max=60"`
}

type ShellTestConfig struct {
	Command          string            `json:"command" validate:"required"`
	Env              map[string]string `json:"env,omitempty"`
	ExpectedOutput   string            `json:"expected_output,omitempty"`
	ExpectedExitCode int               `json:"expected_exit_code,omitempty"`
}

type DelayTestConfig struct {
	DurationMs int `json:"duration_ms" validate:"required,min=1,max=600000"`
}
