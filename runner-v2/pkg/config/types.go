package config

type Config struct {
	Services []ServiceConfig `yaml:"services" json:"services"`
	Tests    []TestConfig    `yaml:"tests" json:"tests"`
}

type ServiceConfig struct {
	Name          string              `yaml:"name" json:"name"`
	Type          string              `yaml:"type" json:"type"` // "generic", "postgres","redis","mysql","mariadb"
	Image         string              `yaml:"image" json:"image"`
	Command       []string            `yaml:"command,omitempty" json:"command,omitempty"`
	Env           map[string]string   `yaml:"env,omitempty" json:"env,omitempty"`
	Ports         []string            `yaml:"ports,omitempty" json:"ports,omitempty"` //Format : "host:container"
	DependsOn     []string            `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
	WaitStratergy WaitStratergyConfig `yaml:"wait_stratergy" json:"wait_stratergy"`
	InitScripts   []string            `yaml:"init_scripts,omitempty" json:"init_scripts,omitempty"`
	Registry      *RegistryConfig     `yaml:"registry" json:"registry"`
}

type TestConfig struct {
	Name      string         `yaml:"name" json:"name"`
	Type      string         `yaml:"type" json:"type"`
	DependsOn []string       `yaml:"depends_on,omitempty" json:"depends_on,omitempty"`
	Config    map[string]any `yaml:"config" json:"config"`
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
