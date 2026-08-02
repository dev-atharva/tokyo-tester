package dto

import "github.com/dev-atharva/cots/pkg/config"

type CreateServicesRequest struct {
	Services         []ServiceDTO         `json:"services" validate:"required,min=1,dive"`
	ExecutionContext *ExecutionContextDTO `json:"execution_context,omitempty"`
}

type ExecutionContextDTO struct {
	SessionID     string `json:"session_id,omitempty"`
	ProjectID     string `json:"project_id,omitempty"`
	UserID        string `json:"user_id,omitempty"`
	ClientID      string `json:"client_id,omitempty"`
	WorkflowID    string `json:"workflow_id,omitempty"`
	WorkflowRunID string `json:"workflow_run_id,omitempty"`
	ScenarioID    string `json:"scenario_id,omitempty"`
	ScenarioName  string `json:"scenario_name,omitempty"`
}

type ServiceDTO struct {
	Name                   string                     `json:"name" validate:"required,min=1,max=100"`
	Type                   string                     `json:"type" validate:"required,oneof=generic postgres mysql mariadb redis memcached kafka rabbitmq mongodb nginx mockserver"`
	Image                  string                     `json:"image,omitempty" validate:"required_if=Type generic"`
	Command                []string                   `json:"command,omitempty"`
	Env                    map[string]string          `json:"env,omitempty"`
	Ports                  []string                   `json:"ports,omitempty"`
	DependsOn              []string                   `json:"depends_on,omitempty"`
	WaitStrategy           WaitStrategyDTO            `json:"wait_strategy"`
	InitScripts            []string                   `json:"init_scripts,omitempty"`
	MockServerExpectations []MockServerExpectationDTO `json:"mockserver_expectations,omitempty" validate:"excluded_unless=Type mockserver,dive"`
	Registry               *RegistryDTO               `json:"registry,omitempty"`
}

type MockServerExpectationDTO struct {
	ID       string                        `json:"id" validate:"required,min=1,max=100"`
	Request  MockServerExpectationMatchDTO `json:"request" validate:"required"`
	Response MockServerExpectationReplyDTO `json:"response" validate:"required"`
}

type MockServerExpectationMatchDTO struct {
	Method  string            `json:"method" validate:"required,oneof=GET POST PUT PATCH DELETE HEAD OPTIONS"`
	Path    string            `json:"path" validate:"required,startswith=/"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

type MockServerExpectationReplyDTO struct {
	StatusCode int               `json:"status_code" validate:"gte=100,lte=599"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       string            `json:"body,omitempty"`
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
		Name:                   s.Name,
		Type:                   s.Type,
		Image:                  s.Image,
		Command:                s.Command,
		Env:                    s.Env,
		Ports:                  s.Ports,
		DependsOn:              s.DependsOn,
		InitScripts:            s.InitScripts,
		MockServerExpectations: toConfigMockServerExpectations(s.MockServerExpectations),
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
		Name:                   cfg.Name,
		Type:                   cfg.Type,
		Image:                  cfg.Image,
		Command:                cfg.Command,
		Env:                    cfg.Env,
		Ports:                  cfg.Ports,
		DependsOn:              cfg.DependsOn,
		InitScripts:            cfg.InitScripts,
		MockServerExpectations: fromConfigMockServerExpectations(cfg.MockServerExpectations),
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

func toConfigMockServerExpectations(expectations []MockServerExpectationDTO) []config.MockServerExpectation {
	result := make([]config.MockServerExpectation, 0, len(expectations))
	for _, expectation := range expectations {
		result = append(result, config.MockServerExpectation{
			ID: expectation.ID,
			Request: config.MockServerExpectationMatch{
				Method: expectation.Request.Method, Headers: expectation.Request.Headers,
				Path: expectation.Request.Path, Body: expectation.Request.Body,
			},
			Response: config.MockServerExpectationReply{
				StatusCode: expectation.Response.StatusCode, Headers: expectation.Response.Headers,
				Body: expectation.Response.Body,
			},
		})
	}
	return result
}

func fromConfigMockServerExpectations(expectations []config.MockServerExpectation) []MockServerExpectationDTO {
	result := make([]MockServerExpectationDTO, 0, len(expectations))
	for _, expectation := range expectations {
		result = append(result, MockServerExpectationDTO{
			ID: expectation.ID,
			Request: MockServerExpectationMatchDTO{
				Method: expectation.Request.Method, Headers: expectation.Request.Headers,
				Path: expectation.Request.Path, Body: expectation.Request.Body,
			},
			Response: MockServerExpectationReplyDTO{
				StatusCode: expectation.Response.StatusCode, Headers: expectation.Response.Headers,
				Body: expectation.Response.Body,
			},
		})
	}
	return result
}
