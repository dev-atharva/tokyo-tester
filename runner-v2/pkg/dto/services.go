package dto

import "github.com/dev-atharva/cots/pkg/config"

type CreateServicesRequest struct {
	Services         []ServiceDTO         `json:"services" validate:"required,min=1,dive"`
	ExecutionContext *ExecutionContextDTO `json:"execution_context,omitempty"`
}

type ExecutionContextDTO struct {
	WorkflowID    string `json:"workflow_id,omitempty"`
	WorkflowRunID string `json:"workflow_run_id,omitempty"`
	ScenarioID    string `json:"scenario_id,omitempty"`
	ScenarioName  string `json:"scenario_name,omitempty"`
}

type ServiceDTO struct {
	Name         string            `json:"name" validate:"required,min=1,max=100"`
	Type         string            `json:"type" validate:"required,oneof=generic postgres mysql mariadb redis memcached kafka"`
	Image        string            `json:"image,omitempty" validate:"required_if=Type generic"`
	Command      []string          `json:"command,omitempty"`
	Env          map[string]string `json:"env,omitempty"`
	Ports        []string          `json:"ports,omitempty"`
	DependsOn    []string          `json:"depends_on,omitempty"`
	WaitStrategy WaitStrategyDTO   `json:"wait_strategy"`
	InitScripts  []string          `json:"init_scripts,omitempty"`
	Registry     *RegistryDTO      `json:"registry,omitempty"`
}

type WaitStrategyDTO struct {
	Type    string `json:"type,omitempty" validate:"omitempty,oneof=log port exec"`
	Target  string `json:"target,omitempty"`
	Timeout int    `json:"timeout,omitempty" validate:"omitempty,min=1,max=300"`
}

type RegistryDTO struct {
	URL      string `json:"url" validate:"required,url"`
	AuthType string `json:"auth_type,omitempty" validate:"omitempty,oneof=basic token"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
	Token    string `json:"token,omitempty"`
}

type CreateServicesResponse struct {
	SessionID string `json:"session_id"`
	Message   string `json:"message"`
}

func (s *ServiceDTO) ToConfig() config.ServiceConfig {
	cfg := config.ServiceConfig{
		Name:        s.Name,
		Type:        s.Type,
		Image:       s.Image,
		Command:     s.Command,
		Env:         s.Env,
		Ports:       s.Ports,
		DependsOn:   s.DependsOn,
		InitScripts: s.InitScripts,
	}

	if s.WaitStrategy.Type != "" {
		cfg.WaitStratergy = config.WaitStratergyConfig{
			Type:    s.WaitStrategy.Type,
			Target:  s.WaitStrategy.Target,
			Timeout: s.WaitStrategy.Timeout,
		}
	}

	if s.Registry != nil {
		cfg.Registry = &config.RegistryConfig{
			URL:      s.Registry.URL,
			AuthType: s.Registry.AuthType,
			Username: s.Registry.Username,
			Password: s.Registry.Password,
			Token:    s.Registry.Token,
		}
	}

	return cfg
}

func (req *CreateServicesRequest) ToConfigList() []config.ServiceConfig {
	configs := make([]config.ServiceConfig, len(req.Services))
	for i, svc := range req.Services {
		configs[i] = svc.ToConfig()
	}
	return configs
}

func FromServiceConfig(cfg config.ServiceConfig) ServiceDTO {
	dto := ServiceDTO{
		Name:        cfg.Name,
		Type:        cfg.Type,
		Image:       cfg.Image,
		Command:     cfg.Command,
		Env:         cfg.Env,
		Ports:       cfg.Ports,
		DependsOn:   cfg.DependsOn,
		InitScripts: cfg.InitScripts,
	}

	if cfg.WaitStratergy.Type != "" {
		dto.WaitStrategy = WaitStrategyDTO{
			Type:    cfg.WaitStratergy.Type,
			Target:  cfg.WaitStratergy.Target,
			Timeout: cfg.WaitStratergy.Timeout,
		}
	}

	if cfg.Registry != nil {
		dto.Registry = &RegistryDTO{
			URL:      cfg.Registry.URL,
			AuthType: cfg.Registry.AuthType,
			Username: cfg.Registry.Username,
			Password: cfg.Registry.Password,
			Token:    cfg.Registry.Token,
		}
	}
	return dto
}
