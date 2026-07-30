package predefined

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/provider"
	"github.com/dev-atharva/cots/pkg/registry"
	"github.com/dev-atharva/cots/pkg/types"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/mockserver"
)

const (
	defaultMockServerImage       = "mockserver/mockserver:5.15.0"
	mockServerInitializationPath = "/config/mockserverInitialization.json"
)

type MockServerProvider struct{}

type mockServerInitializerExpectation struct {
	HTTPRequest  mockServerInitializerRequest  `json:"httpRequest"`
	HTTPResponse mockServerInitializerResponse `json:"httpResponse"`
}

type mockServerInitializerRequest struct {
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    string            `json:"body,omitempty"`
}

type mockServerInitializerResponse struct {
	StatusCode int               `json:"statusCode"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       string            `json:"body,omitempty"`
}

func (p *MockServerProvider) Provision(ctx context.Context, cfg config.ServiceConfig, network *testcontainers.DockerNetwork) (testcontainers.Container, *types.ServiceRuntime, error) {
	image := cfg.Image
	if image == "" {
		image = defaultMockServerImage
	}

	initializationJSON, err := mockServerInitializationJSON(cfg.MockServerExpectations)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to serialize MockServer expectations: %w", err)
	}

	container, err := p.createContainerWithFallback(ctx, cfg, image, initializationJSON, network)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to start the MockServer container: %w", err)
	}
	if err := verifyMockServerInitialization(ctx, container, len(cfg.MockServerExpectations)); err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to verify MockServer initialization: %w", err)
	}

	if err := executeServiceInitScripts(ctx, container, cfg.InitScripts); err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to initialize MockServer: %w", err)
	}

	host, err := container.Host(ctx)
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get MockServer host: %w", err)
	}
	host = types.AddressableHost(host)
	mappedPort, err := container.MappedPort(ctx, "1080/tcp")
	if err != nil {
		_ = container.Terminate(ctx)
		return nil, nil, fmt.Errorf("failed to get MockServer port: %w", err)
	}

	runtime := &types.ServiceRuntime{
		Name:        cfg.Name,
		ContainerID: container.GetContainerID(),
		Host:        host,
		MappedPorts: map[string]string{"1080": mappedPort.Port()},
		EnvVars:     cloneEnvironment(cfg.Env),
	}
	runtime.EnvVars["MOCKSERVER_URL"] = fmt.Sprintf("http://%s", types.JoinHostPort(host, mappedPort.Port()))

	return container, runtime, nil
}

func mockServerInitializationJSON(expectations []config.MockServerExpectation) ([]byte, error) {
	initializers := make([]mockServerInitializerExpectation, 0, len(expectations))
	for _, expectation := range expectations {
		initializers = append(initializers, mockServerInitializerExpectation{
			HTTPRequest: mockServerInitializerRequest{
				Method:  expectation.Request.Method,
				Path:    expectation.Request.Path,
				Headers: expectation.Request.Headers,
				Body:    expectation.Request.Body,
			},
			HTTPResponse: mockServerInitializerResponse{
				StatusCode: expectation.Response.StatusCode,
				Headers:    expectation.Response.Headers,
				Body:       expectation.Response.Body,
			},
		})
	}
	return json.MarshalIndent(initializers, "", "  ")
}

func verifyMockServerInitialization(ctx context.Context, container *mockserver.MockServerContainer, expected int) error {
	endpoint, err := container.URL(ctx)
	if err != nil {
		return fmt.Errorf("resolve MockServer URL: %w", err)
	}
	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPut,
		endpoint+"/mockserver/retrieve?type=ACTIVE_EXPECTATIONS&format=JSON",
		strings.NewReader("{}"),
	)
	if err != nil {
		return fmt.Errorf("build expectation verification request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("retrieve active expectations: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("retrieve active expectations returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return validateMockServerExpectationCount(resp.Body, expected)
}

func validateMockServerExpectationCount(reader io.Reader, expected int) error {
	var active []json.RawMessage
	if err := json.NewDecoder(reader).Decode(&active); err != nil {
		return fmt.Errorf("decode active expectations: %w", err)
	}
	if len(active) != expected {
		return fmt.Errorf("initializer loaded %d of %d expectations", len(active), expected)
	}
	return nil
}

func (p *MockServerProvider) createContainerWithFallback(ctx context.Context, cfg config.ServiceConfig, image string, initializationJSON []byte, network *testcontainers.DockerNetwork) (*mockserver.MockServerContainer, error) {
	env := cloneEnvironment(cfg.Env)
	env["MOCKSERVER_INITIALIZATION_JSON_PATH"] = mockServerInitializationPath
	env["MOCKSERVER_FAIL_ON_INITIALIZATION_ERROR"] = "true"

	create := func(candidate string) (*mockserver.MockServerContainer, error) {
		return mockserver.Run(ctx, candidate,
			testcontainers.WithFiles(testcontainers.ContainerFile{
				Reader:            strings.NewReader(string(initializationJSON)),
				ContainerFilePath: mockServerInitializationPath,
				FileMode:          0o644,
			}),
			testcontainers.CustomizeRequest(testcontainers.GenericContainerRequest{
				ContainerRequest: testcontainers.ContainerRequest{
					Name:               provider.ContainerName(ctx, cfg.Name),
					HostConfigModifier: provider.ResourceHostConfigModifier(cfg.Resources),
					Labels:             provider.ResourceLabels(ctx, provider.ResourceTypeContainer),
					Networks:           []string{network.Name},
					NetworkAliases:     map[string][]string{network.Name: {cfg.Name}},
					Env:                env,
					Cmd:                cfg.Command,
				},
			}),
		)
	}

	if cfg.Registry != nil && cfg.Registry.URL != "" {
		customImage := registry.ResolveImageName(image, cfg.Registry)
		container, err := create(customImage)
		if err == nil {
			return container, nil
		}
		log.Printf("Falling back to docker hub for image %s", image)
	}

	container, err := create(image)
	if err != nil {
		return container, fmt.Errorf("failed to pull image from both custom registry and docker hub: %w", err)
	}
	return container, nil
}

func (p *MockServerProvider) Cleanup(ctx context.Context, container testcontainers.Container) error {
	if container == nil {
		return nil
	}
	return container.Terminate(ctx)
}
