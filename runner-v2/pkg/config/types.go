package config

type Config struct {
	Services []ServiceConfig `yaml:"services" json:"services"`
	Tests    []TestConfig    `yaml:"tests" json:"tests"`
}

type ServiceConfig struct {
	ID                     string                  `yaml:"id,omitempty" json:"id,omitempty"`
	Name                   string                  `yaml:"name" json:"name"`
	Type                   string                  `yaml:"type" json:"type"`
	Image                  string                  `yaml:"image" json:"image"`
	Command                []string                `yaml:"command,omitempty" json:"command,omitempty"`
	Env                    map[string]string       `yaml:"env,omitempty" json:"env,omitempty"`
	Ports                  []string                `yaml:"ports,omitempty" json:"ports,omitempty"` // Format: "host:container"
	DependsOn              []string                `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
	WaitStratergy          WaitStratergyConfig     `yaml:"wait_stratergy" json:"wait_stratergy"`
	InitScripts            []string                `yaml:"init_scripts,omitempty" json:"init_scripts,omitempty"`
	MockServerExpectations []MockServerExpectation `yaml:"mockserver_expectations,omitempty" json:"mockserver_expectations,omitempty"`
	Registry               *RegistryConfig         `yaml:"registry" json:"registry"`
	Resources              ContainerResourceLimits `yaml:"-" json:"-"`
}

type MockServerExpectation struct {
	ID       string                     `yaml:"id" json:"id"`
	Request  MockServerExpectationMatch `yaml:"request" json:"request"`
	Response MockServerExpectationReply `yaml:"response" json:"response"`
}

type MockServerExpectationMatch struct {
	Method  string            `yaml:"method" json:"method"`
	Path    string            `yaml:"path" json:"path"`
	Headers map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Body    string            `yaml:"body,omitempty" json:"body,omitempty"`
}

type MockServerExpectationReply struct {
	StatusCode int               `yaml:"status_code" json:"status_code"`
	Headers    map[string]string `yaml:"headers,omitempty" json:"headers,omitempty"`
	Body       string            `yaml:"body,omitempty" json:"body,omitempty"`
}

// ContainerResourceLimits is assigned by the trusted runner. It is excluded
// from workflow payloads so callers cannot raise their own server limits.
type ContainerResourceLimits struct {
	MemoryBytes int64
	NanoCPUs    int64
	PIDs        int64
}

type TestConfig struct {
	ID             string          `yaml:"id,omitempty" json:"id,omitempty"`
	Name           string          `yaml:"name" json:"name"`
	Type           string          `yaml:"type" json:"type"`
	TargetServices []string        `yaml:"target_services,omitempty" json:"target_services,omitempty"`
	DependsOn      []string        `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
	RetryPolicy    TestRetryPolicy `yaml:"retry_policy,omitempty" json:"retry_policy,omitempty"`
	Config         map[string]any  `yaml:"config" json:"config"`
}

type TestRetryPolicy struct {
	Mode                 string `yaml:"mode,omitempty" json:"mode,omitempty"`
	IdempotencyConfirmed bool   `yaml:"idempotency_confirmed,omitempty" json:"idempotency_confirmed,omitempty"`
}

func (p TestRetryPolicy) EffectiveMode() string {
	if p.Mode == "" {
		return "transient"
	}
	return p.Mode
}

type WaitStratergyConfig struct {
	Type    string `yaml:"type" json:"type"`                           // "log","port","exec"
	Target  string `yaml:"target,omitempty" json:"target,omitempty"`   // log message , port number , exec command
	Timeout int    `yaml:"timeout,omitempty" json:"timeout,omitempty"` // seconds
}

type RegistryConfig struct {
	URL      string `yaml:"url" json:"url"`
	AuthType string `yaml:"auth_type,omitempty" json:"auth_type,omitempty"`
	Username string `yaml:"username,omitempty" json:"username,omitempty"`
	Password string `yaml:"password,omitempty" json:"password,omitempty"`
	Token    string `yaml:"token,omitempty" json:"token,omitempty"`
}
