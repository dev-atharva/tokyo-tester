package workflowbundle

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"slices"
	"strings"

	"github.com/dev-atharva/cots/pkg/config"
)

const (
	SchemaVersion = 1
	BundleKind    = "cots.workflow-bundle"
)

type Bundle struct {
	SchemaVersion int              `json:"schemaVersion"`
	Kind          string           `json:"kind"`
	Workflow      Workflow         `json:"workflow"`
	Scenarios     []BundleScenario `json:"scenarios"`
}

type Workflow struct {
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	Nodes       []FlowNode `json:"nodes"`
	Edges       []FlowEdge `json:"edges"`
}

type FlowNode struct {
	ID   string       `json:"id"`
	Data FlowNodeData `json:"data"`
}

type FlowNodeData struct {
	Label   string          `json:"label"`
	Service ServiceNodeData `json:"service"`
}

type ServiceNodeData struct {
	Type          string                `json:"type"`
	Image         string                `json:"image,omitempty"`
	Command       []string              `json:"command,omitempty"`
	Ports         []PortMapping         `json:"ports,omitempty"`
	Env           []EnvironmentVariable `json:"env,omitempty"`
	WaitStratergy *WaitStrategyState    `json:"waitStratergy,omitempty"`
	InitScripts   []InitScript          `json:"initScripts,omitempty"`
}

type PortMapping struct {
	ID            string `json:"id,omitempty"`
	HostPort      string `json:"hostPort"`
	ContainerPort string `json:"containerPort"`
}

type EnvironmentVariable struct {
	ID    string `json:"id,omitempty"`
	Key   string `json:"key"`
	Value string `json:"value"`
}

type WaitStrategyState struct {
	Enabled bool   `json:"enabled"`
	Type    string `json:"type"`
	Target  string `json:"target,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

type InitScript struct {
	ID          string `json:"id,omitempty"`
	Order       int    `json:"order"`
	Script      string `json:"script"`
	Description string `json:"description,omitempty"`
}

type FlowEdge struct {
	ID     string `json:"id,omitempty"`
	Source string `json:"source"`
	Target string `json:"target"`
}

type BundleScenario struct {
	Name        string                   `json:"name"`
	Description string                   `json:"description,omitempty"`
	Tests       []ScenarioTestDefinition `json:"tests"`
	TestOrder   []string                 `json:"testOrder"`
}

type ScenarioTestDefinition struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Type             string          `json:"type"`
	TargetServices   []string        `json:"targetServices"`
	DependsOnTestIDs []string        `json:"dependsOnTestIds,omitempty"`
	DatabaseConfig   *DatabaseConfig `json:"databaseConfig,omitempty"`
	DocumentConfig   *DocumentConfig `json:"documentConfig,omitempty"`
	HTTPConfig       *HTTPConfig     `json:"httpConfig,omitempty"`
	ShellConfig      *ShellConfig    `json:"shellConfig,omitempty"`
	CacheConfig      *CacheConfig    `json:"cacheConfig,omitempty"`
	QueueConfig      *QueueConfig    `json:"queueConfig,omitempty"`
	DelayConfig      *DelayConfig    `json:"delayConfig,omitempty"`
}

type DatabaseConfig struct {
	Driver         string `json:"driver"`
	Database       string `json:"database"`
	User           string `json:"user"`
	Password       string `json:"password"`
	Query          string `json:"query"`
	ExpectedResult any    `json:"expectedResult,omitempty"`
}

type DocumentConfig struct {
	Service           string           `json:"service"`
	Database          string           `json:"database"`
	Collection        string           `json:"collection"`
	Operation         string           `json:"operation"`
	Document          map[string]any   `json:"document,omitempty"`
	Filter            map[string]any   `json:"filter,omitempty"`
	Update            map[string]any   `json:"update,omitempty"`
	ExpectedDocument  map[string]any   `json:"expectedDocument,omitempty"`
	ExpectedDocuments []map[string]any `json:"expectedDocuments,omitempty"`
	ExpectedCount     *int             `json:"expectedCount,omitempty"`
	ExpectedExists    *bool            `json:"expectedExists,omitempty"`
}

type HTTPConfig struct {
	Method         string            `json:"method"`
	Path           string            `json:"path"`
	Port           string            `json:"port"`
	Headers        map[string]string `json:"headers,omitempty"`
	Body           string            `json:"body,omitempty"`
	ExpectedStatus int               `json:"expectedStatus,omitempty"`
	ExpectedBody   *ExpectedBody     `json:"expectedBody,omitempty"`
}

type ExpectedBody struct {
	Mode  string `json:"mode"`
	Value any    `json:"value"`
}

type ShellConfig struct {
	Command          string            `json:"command"`
	Env              map[string]string `json:"env,omitempty"`
	ExpectedOutput   string            `json:"expectedOutput,omitempty"`
	ExpectedExitCode int               `json:"expectedExitCode,omitempty"`
}

type CacheConfig struct {
	Service        string `json:"service"`
	CacheType      string `json:"cacheType"`
	Operation      string `json:"operation"`
	Key            string `json:"key,omitempty"`
	Value          any    `json:"value,omitempty"`
	ExpectedValue  any    `json:"expectedValue,omitempty"`
	ExpectedExists *bool  `json:"expectedExists,omitempty"`
	TTL            int    `json:"ttl,omitempty"`
	DB             int    `json:"db,omitempty"`
	Password       string `json:"password,omitempty"`
}

type QueueConfig struct {
	Service         string `json:"service"`
	BrokerType      string `json:"brokerType"`
	Operation       string `json:"operation"`
	Topic           string `json:"topic,omitempty"`
	Message         any    `json:"message,omitempty"`
	Key             string `json:"key,omitempty"`
	Partition       int    `json:"partition,omitempty"`
	Timeout         int    `json:"timeout,omitempty"`
	FromBeginning   bool   `json:"fromBeginning,omitempty"`
	ExpectedCount   int    `json:"expectedCount,omitempty"`
	ExpectedMessage any    `json:"expectedMessage,omitempty"`
	ExpectedExists  *bool  `json:"expectedExists,omitempty"`
}

type DelayConfig struct {
	DurationMs int `json:"durationMs"`
}

type TranslationResult struct {
	Services []config.ServiceConfig
	Tests    []config.TestConfig
}

type workflowServiceGraph struct {
	serviceDeps map[string][]string
	services    []config.ServiceConfig
}

func Decode(reader io.Reader) (*Bundle, error) {
	var bundle Bundle
	if err := json.NewDecoder(reader).Decode(&bundle); err != nil {
		return nil, fmt.Errorf("invalid workflow bundle JSON: %w", err)
	}
	if err := bundle.Validate(); err != nil {
		return nil, err
	}
	return &bundle, nil
}

func (b *Bundle) Validate() error {
	if b.SchemaVersion != SchemaVersion {
		return fmt.Errorf("unsupported workflow bundle schema version: %d", b.SchemaVersion)
	}
	if b.Kind != BundleKind {
		return fmt.Errorf("workflow bundle kind must be %s", BundleKind)
	}
	if strings.TrimSpace(b.Workflow.Name) == "" {
		return fmt.Errorf("workflow bundle must include a workflow name")
	}
	if err := validateWorkflowGraph(b.Workflow.Nodes, b.Workflow.Edges); err != nil {
		return err
	}
	graph, err := translateWorkflowGraphToServiceGraph(b.Workflow.Nodes, b.Workflow.Edges)
	if err != nil {
		return err
	}
	if len(b.Scenarios) == 0 {
		return fmt.Errorf("workflow bundle must include at least one scenario")
	}
	for index, scenario := range b.Scenarios {
		if err := validateScenario(graph, scenario, index); err != nil {
			return err
		}
	}
	return nil
}

func (b *Bundle) TranslateScenario(scenario BundleScenario) (*TranslationResult, error) {
	graph, err := translateWorkflowGraphToServiceGraph(b.Workflow.Nodes, b.Workflow.Edges)
	if err != nil {
		return nil, err
	}
	if err := validateScenario(graph, scenario, 0); err != nil {
		return nil, err
	}

	requiredServices := expandScenarioServiceSubset(graph, scenario.Tests)
	services := make([]config.ServiceConfig, 0, len(graph.services))
	for _, service := range graph.services {
		if requiredServices[service.Name] {
			services = append(services, service)
		}
	}

	return &TranslationResult{
		Services: services,
		Tests:    translateScenarioTests(scenario, requiredServices),
	}, nil
}

func validateWorkflowGraph(nodes []FlowNode, edges []FlowEdge) error {
	if len(nodes) == 0 {
		return fmt.Errorf("flow must contain at least one node")
	}

	for _, node := range nodes {
		if strings.TrimSpace(node.Data.Label) == "" {
			return fmt.Errorf("node must have a label")
		}
		if node.Data.Service.Type == "" {
			return fmt.Errorf("node %q must have service definition", node.Data.Label)
		}
		if node.Data.Service.Type == "generic" && strings.TrimSpace(node.Data.Service.Image) == "" {
			return fmt.Errorf("generic service %q must specify the docker image", node.Data.Label)
		}
	}

	graph := buildServiceDependencies(nodes, edges)
	if cycles := detectCycles(graph); len(cycles) > 0 {
		return fmt.Errorf("circular dependencies detected: %s", strings.Join(cycles, ", "))
	}

	return nil
}

func validateScenario(graph workflowServiceGraph, scenario BundleScenario, index int) error {
	if strings.TrimSpace(scenario.Name) == "" {
		return fmt.Errorf("scenario %d must include a name", index+1)
	}
	if len(scenario.Tests) == 0 {
		return fmt.Errorf("scenario %q must contain at least one test", scenario.Name)
	}

	testIDs := make(map[string]struct{}, len(scenario.Tests))
	serviceNames := make(map[string]struct{}, len(graph.services))
	for _, service := range graph.services {
		serviceNames[service.Name] = struct{}{}
	}

	for _, test := range scenario.Tests {
		if _, exists := testIDs[test.ID]; exists {
			return fmt.Errorf("scenario %q contains duplicate test id %q", scenario.Name, test.ID)
		}
		testIDs[test.ID] = struct{}{}
		if strings.TrimSpace(test.Name) == "" {
			return fmt.Errorf("scenario %q contains a test without a name", scenario.Name)
		}
		if len(test.TargetServices) == 0 {
			return fmt.Errorf("scenario test %q must target at least one service", test.Name)
		}
		for _, serviceName := range test.TargetServices {
			if _, ok := serviceNames[serviceName]; !ok {
				return fmt.Errorf("scenario test %q references unknown service %q", test.Name, serviceName)
			}
		}
		for _, depID := range test.DependsOnTestIDs {
			if _, ok := testIDs[depID]; !ok && !scenarioHasTest(scenario.Tests, depID) {
				return fmt.Errorf("scenario test %q depends on missing test %q", test.Name, depID)
			}
		}
	}

	if len(scenario.TestOrder) != len(scenario.Tests) {
		return fmt.Errorf("scenario %q testOrder must include every test exactly once", scenario.Name)
	}

	orderSeen := make(map[string]struct{}, len(scenario.TestOrder))
	for _, testID := range scenario.TestOrder {
		if _, exists := orderSeen[testID]; exists {
			return fmt.Errorf("scenario %q contains duplicate testOrder id %q", scenario.Name, testID)
		}
		orderSeen[testID] = struct{}{}
		if _, ok := testIDs[testID]; !ok {
			return fmt.Errorf("scenario %q testOrder references unknown test %q", scenario.Name, testID)
		}
	}

	return nil
}

func translateWorkflowGraphToServiceGraph(nodes []FlowNode, edges []FlowEdge) (workflowServiceGraph, error) {
	serviceDeps := buildServiceDependencies(nodes, edges)
	services, err := translateServices(nodes, serviceDeps)
	if err != nil {
		return workflowServiceGraph{}, err
	}
	return workflowServiceGraph{
		serviceDeps: serviceDeps,
		services:    services,
	}, nil
}

func buildServiceDependencies(nodes []FlowNode, edges []FlowEdge) map[string][]string {
	graph := make(map[string][]string, len(nodes))
	nodeMap := make(map[string]FlowNode, len(nodes))
	nodeTypes := make(map[string]string, len(nodes))

	for _, node := range nodes {
		serviceName := SanitizeName(node.Data.Label)
		graph[serviceName] = []string{}
		nodeMap[node.ID] = node
		nodeTypes[serviceName] = node.Data.Service.Type
	}

	for _, edge := range edges {
		source, sourceOK := nodeMap[edge.Source]
		target, targetOK := nodeMap[edge.Target]
		if !sourceOK || !targetOK {
			continue
		}
		sourceName := SanitizeName(source.Data.Label)
		targetName := SanitizeName(target.Data.Label)
		graph[sourceName] = appendUnique(graph[sourceName], targetName)
	}

	infraServices := make([]string, 0)
	for serviceName, serviceType := range nodeTypes {
		if isInfrastructureType(serviceType) {
			infraServices = append(infraServices, serviceName)
		}
	}

	for serviceName, serviceType := range nodeTypes {
		if serviceType != "generic" {
			continue
		}
		merged := slices.Clone(graph[serviceName])
		for _, infra := range infraServices {
			if infra == serviceName {
				continue
			}
			candidate := appendUnique(merged, infra)
			temp := cloneDependencyGraph(graph)
			temp[serviceName] = candidate
			if len(detectCycles(temp)) == 0 {
				merged = candidate
			}
		}
		graph[serviceName] = merged
	}

	return graph
}

func translateServices(nodes []FlowNode, serviceDeps map[string][]string) ([]config.ServiceConfig, error) {
	aliases := buildServiceAliasMap(nodes)
	services := make([]config.ServiceConfig, 0, len(nodes))

	for _, node := range nodes {
		serviceName := SanitizeName(node.Data.Label)
		cfg := config.ServiceConfig{
			Name: serviceName,
			Type: node.Data.Service.Type,
		}
		if cfg.Type == "generic" {
			cfg.Image = node.Data.Service.Image
		}
		if len(node.Data.Service.Command) > 0 {
			cfg.Command = make([]string, 0, len(node.Data.Service.Command))
			for _, command := range node.Data.Service.Command {
				cfg.Command = append(cfg.Command, normalizeServiceReferences(command, aliases))
			}
		}
		if len(node.Data.Service.Env) > 0 {
			cfg.Env = make(map[string]string, len(node.Data.Service.Env))
			for _, env := range node.Data.Service.Env {
				if strings.TrimSpace(env.Key) == "" {
					continue
				}
				cfg.Env[strings.TrimSpace(env.Key)] = normalizeServiceReferences(env.Value, aliases)
			}
		}
		if len(node.Data.Service.Ports) > 0 {
			cfg.Ports = make([]string, 0, len(node.Data.Service.Ports))
			for _, port := range node.Data.Service.Ports {
				cfg.Ports = append(cfg.Ports, fmt.Sprintf("%s:%s", port.HostPort, port.ContainerPort))
			}
		}
		if ws := node.Data.Service.WaitStratergy; ws != nil && ws.Enabled {
			cfg.WaitStratergy = config.WaitStratergyConfig{
				Type:    ws.Type,
				Target:  ws.Target,
				Timeout: ws.Timeout,
			}
		}
		if len(node.Data.Service.InitScripts) > 0 {
			scripts := slices.Clone(node.Data.Service.InitScripts)
			slices.SortFunc(scripts, func(left, right InitScript) int {
				return left.Order - right.Order
			})
			cfg.InitScripts = make([]string, 0, len(scripts))
			for _, script := range scripts {
				cfg.InitScripts = append(cfg.InitScripts, normalizeServiceReferences(script.Script, aliases))
			}
		}
		if deps := serviceDeps[serviceName]; len(deps) > 0 {
			cfg.DependsOn = slices.Clone(deps)
		}
		services = append(services, cfg)
	}

	slices.SortFunc(services, func(left, right config.ServiceConfig) int {
		return strings.Compare(left.Name, right.Name)
	})

	return services, nil
}

func buildServiceAliasMap(nodes []FlowNode) map[string]string {
	aliases := make(map[string]string)
	for _, node := range nodes {
		sanitized := SanitizeName(firstNonEmpty(node.Data.Label, node.ID))
		candidates := []string{
			node.Data.Label,
			node.ID,
			sanitized,
			strings.TrimSpace(node.Data.Label),
			strings.TrimSpace(node.ID),
		}
		for _, candidate := range candidates {
			if candidate == "" {
				continue
			}
			aliases[candidate] = sanitized
			aliases[strings.ToLower(candidate)] = sanitized
		}
	}
	return aliases
}

func normalizeServiceReferences(value string, aliases map[string]string) string {
	if value == "" {
		return ""
	}
	return serviceRefPattern.ReplaceAllStringFunc(value, func(match string) string {
		rawRef := strings.TrimSuffix(strings.TrimPrefix(match, "${"), "}")
		parts := strings.Split(rawRef, ".")
		if len(parts) < 2 {
			return match
		}
		serviceToken := parts[0]
		normalized := aliases[serviceToken]
		if normalized == "" {
			normalized = aliases[strings.TrimSpace(serviceToken)]
		}
		if normalized == "" {
			normalized = aliases[strings.ToLower(serviceToken)]
		}
		if normalized == "" {
			normalized = SanitizeName(serviceToken)
		}
		return fmt.Sprintf("${%s.%s}", normalized, strings.Join(parts[1:], "."))
	})
}

func expandScenarioServiceSubset(
	graph workflowServiceGraph,
	tests []ScenarioTestDefinition,
) map[string]bool {
	required := make(map[string]bool)
	var visit func(string)
	visit = func(serviceName string) {
		if required[serviceName] {
			return
		}
		required[serviceName] = true
		for _, dependency := range graph.serviceDeps[serviceName] {
			visit(dependency)
		}
	}
	for _, test := range tests {
		for _, serviceName := range test.TargetServices {
			visit(serviceName)
		}
	}
	return required
}

func translateScenarioTests(
	scenario BundleScenario,
	requiredServices map[string]bool,
) []config.TestConfig {
	orderedIDs := make([]string, 0, len(scenario.TestOrder))
	for _, id := range scenario.TestOrder {
		if scenarioHasTest(scenario.Tests, id) {
			orderedIDs = append(orderedIDs, id)
		}
	}

	tests := make([]ScenarioTestDefinition, 0, len(scenario.Tests))
	for _, id := range orderedIDs {
		if test, ok := findScenarioTest(scenario.Tests, id); ok {
			tests = append(tests, test)
		}
	}
	for _, test := range scenario.Tests {
		if !slices.Contains(orderedIDs, test.ID) {
			tests = append(tests, test)
		}
	}

	result := make([]config.TestConfig, 0, len(tests))
	for index, testDef := range tests {
		defaultService := ""
		if len(testDef.TargetServices) > 0 {
			defaultService = testDef.TargetServices[0]
		}

		dependsOn := slices.Clone(testDef.DependsOnTestIDs)
		if index > 0 {
			dependsOn = appendUnique(dependsOn, tests[index-1].Name)
		}

		result = append(result, config.TestConfig{
			Name:      testDef.Name,
			Type:      testDef.Type,
			DependsOn: dependsOn,
			Config:    buildTestConfig(testDef, defaultService, requiredServices),
		})
	}

	return result
}

func buildTestConfig(
	testDef ScenarioTestDefinition,
	defaultService string,
	requiredServices map[string]bool,
) map[string]any {
	targetService := defaultService
	if !requiredServices[targetService] {
		for serviceName := range requiredServices {
			targetService = serviceName
			break
		}
	}

	switch testDef.Type {
	case "database":
		return map[string]any{
			"service":         targetService,
			"driver":          valueOrDefault(testDef.DatabaseConfig, func(cfg *DatabaseConfig) string { return cfg.Driver }, "postgres"),
			"database":        valueOrDefault(testDef.DatabaseConfig, func(cfg *DatabaseConfig) string { return cfg.Database }, ""),
			"user":            valueOrDefault(testDef.DatabaseConfig, func(cfg *DatabaseConfig) string { return cfg.User }, ""),
			"password":        valueOrDefault(testDef.DatabaseConfig, func(cfg *DatabaseConfig) string { return cfg.Password }, ""),
			"query":           valueOrDefault(testDef.DatabaseConfig, func(cfg *DatabaseConfig) string { return cfg.Query }, ""),
			"expected_result": valueOrDefaultAny(testDef.DatabaseConfig, func(cfg *DatabaseConfig) any { return cfg.ExpectedResult }, nil),
		}
	case "document":
		return map[string]any{
			"service":            valueOrDefault(testDef.DocumentConfig, func(cfg *DocumentConfig) string { return cfg.Service }, targetService),
			"database":           valueOrDefault(testDef.DocumentConfig, func(cfg *DocumentConfig) string { return cfg.Database }, ""),
			"collection":         valueOrDefault(testDef.DocumentConfig, func(cfg *DocumentConfig) string { return cfg.Collection }, ""),
			"operation":          valueOrDefault(testDef.DocumentConfig, func(cfg *DocumentConfig) string { return cfg.Operation }, "find_one"),
			"document":           valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.Document }, nil),
			"filter":             valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.Filter }, nil),
			"update":             valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.Update }, nil),
			"expected_document":  valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.ExpectedDocument }, nil),
			"expected_documents": valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.ExpectedDocuments }, nil),
			"expected_count":     valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.ExpectedCount }, nil),
			"expected_exists":    valueOrDefaultAny(testDef.DocumentConfig, func(cfg *DocumentConfig) any { return cfg.ExpectedExists }, nil),
		}
	case "http":
		return map[string]any{
			"service":         targetService,
			"method":          valueOrDefault(testDef.HTTPConfig, func(cfg *HTTPConfig) string { return cfg.Method }, "GET"),
			"path":            valueOrDefault(testDef.HTTPConfig, func(cfg *HTTPConfig) string { return cfg.Path }, "/"),
			"port":            valueOrDefault(testDef.HTTPConfig, func(cfg *HTTPConfig) string { return cfg.Port }, "80"),
			"headers":         valueOrDefaultMap(testDef.HTTPConfig, func(cfg *HTTPConfig) map[string]string { return cfg.Headers }),
			"body":            valueOrDefault(testDef.HTTPConfig, func(cfg *HTTPConfig) string { return cfg.Body }, ""),
			"expected_status": valueOrDefault(testDef.HTTPConfig, func(cfg *HTTPConfig) int { return cfg.ExpectedStatus }, 200),
			"expected_body":   translateExpectedHTTPBody(valueOrDefaultAny(testDef.HTTPConfig, func(cfg *HTTPConfig) any { return cfg.ExpectedBody }, nil)),
		}
	case "shell":
		return map[string]any{
			"command":            valueOrDefault(testDef.ShellConfig, func(cfg *ShellConfig) string { return cfg.Command }, ""),
			"env":                valueOrDefaultMap(testDef.ShellConfig, func(cfg *ShellConfig) map[string]string { return cfg.Env }),
			"expected_output":    valueOrDefault(testDef.ShellConfig, func(cfg *ShellConfig) string { return cfg.ExpectedOutput }, ""),
			"expected_exit_code": valueOrDefault(testDef.ShellConfig, func(cfg *ShellConfig) int { return cfg.ExpectedExitCode }, 0),
		}
	case "cache":
		return map[string]any{
			"service":        valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) string { return cfg.Service }, targetService),
			"cache_type":     valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) string { return cfg.CacheType }, "redis"),
			"operation":      valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) string { return cfg.Operation }, "ping"),
			"key":            valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) string { return cfg.Key }, ""),
			"value":          valueOrDefaultAny(testDef.CacheConfig, func(cfg *CacheConfig) any { return cfg.Value }, ""),
			"expected_value": valueOrDefaultAny(testDef.CacheConfig, func(cfg *CacheConfig) any { return cfg.ExpectedValue }, ""),
			"expected_exists": valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) bool {
				return boolOrDefault(cfg.ExpectedExists, false)
			}, false),
			"ttl":      valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) int { return cfg.TTL }, 0),
			"db":       valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) int { return cfg.DB }, 0),
			"password": valueOrDefault(testDef.CacheConfig, func(cfg *CacheConfig) string { return cfg.Password }, ""),
		}
	case "queue":
		return map[string]any{
			"service":          valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) string { return cfg.Service }, targetService),
			"broker_type":      valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) string { return cfg.BrokerType }, "kafka"),
			"operation":        valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) string { return cfg.Operation }, "produce"),
			"topic":            valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) string { return cfg.Topic }, ""),
			"message":          valueOrDefaultAny(testDef.QueueConfig, func(cfg *QueueConfig) any { return cfg.Message }, ""),
			"key":              valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) string { return cfg.Key }, ""),
			"partition":        valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) int { return cfg.Partition }, 0),
			"timeout":          valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) int { return cfg.Timeout }, 10),
			"from_beginning":   valueOrDefaultAny(testDef.QueueConfig, func(cfg *QueueConfig) any { return cfg.FromBeginning }, false),
			"expected_count":   valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) int { return cfg.ExpectedCount }, 1),
			"expected_message": valueOrDefaultAny(testDef.QueueConfig, func(cfg *QueueConfig) any { return cfg.ExpectedMessage }, ""),
			"expected_exists": valueOrDefault(testDef.QueueConfig, func(cfg *QueueConfig) bool {
				return boolOrDefault(cfg.ExpectedExists, true)
			}, true),
		}
	default:
		return map[string]any{
			"duration_ms": valueOrDefault(testDef.DelayConfig, func(cfg *DelayConfig) int { return cfg.DurationMs }, 1000),
		}
	}
}

func translateExpectedHTTPBody(expectedBody any) any {
	body, ok := expectedBody.(*ExpectedBody)
	if !ok || body == nil {
		return nil
	}
	if body.Mode == "contains" {
		switch value := body.Value.(type) {
		case string:
			return value
		default:
			raw, err := json.Marshal(value)
			if err != nil {
				return ""
			}
			return string(raw)
		}
	}
	if raw, ok := body.Value.(string); ok {
		var parsed any
		if err := json.Unmarshal([]byte(raw), &parsed); err == nil {
			return parsed
		}
		return map[string]any{}
	}
	return body.Value
}

func detectCycles(graph map[string][]string) []string {
	visited := make(map[string]bool)
	visiting := make(map[string]bool)
	cycles := []string{}

	var dfs func(string, []string)
	dfs = func(node string, path []string) {
		if visiting[node] {
			cycleStart := slices.Index(path, node)
			if cycleStart >= 0 {
				cycles = append(cycles, strings.Join(append(path[cycleStart:], node), "->"))
			}
			return
		}
		if visited[node] {
			return
		}
		visiting[node] = true
		for _, neighbor := range graph[node] {
			dfs(neighbor, append(path, node))
		}
		delete(visiting, node)
		visited[node] = true
	}

	for node := range graph {
		dfs(node, nil)
	}
	return cycles
}

func SanitizeName(label string) string {
	replacer := strings.NewReplacer(" ", "_", "-", "_")
	sanitized := strings.ToLower(strings.TrimSpace(label))
	sanitized = replacer.Replace(sanitized)

	var builder strings.Builder
	lastUnderscore := false
	for _, r := range sanitized {
		isAllowed := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_'
		if !isAllowed {
			r = '_'
		}
		if r == '_' {
			if lastUnderscore {
				continue
			}
			lastUnderscore = true
		} else {
			lastUnderscore = false
		}
		builder.WriteRune(r)
	}

	return strings.Trim(builder.String(), "_")
}

func scenarioHasTest(tests []ScenarioTestDefinition, id string) bool {
	_, ok := findScenarioTest(tests, id)
	return ok
}

func findScenarioTest(tests []ScenarioTestDefinition, id string) (ScenarioTestDefinition, bool) {
	for _, test := range tests {
		if test.ID == id {
			return test, true
		}
	}
	return ScenarioTestDefinition{}, false
}

func appendUnique(values []string, next string) []string {
	if slices.Contains(values, next) {
		return values
	}
	return append(values, next)
}

func cloneDependencyGraph(graph map[string][]string) map[string][]string {
	cloned := make(map[string][]string, len(graph))
	for key, values := range graph {
		cloned[key] = slices.Clone(values)
	}
	return cloned
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func isInfrastructureType(serviceType string) bool {
	switch serviceType {
	case "postgres", "mysql", "mariadb", "redis", "kafka", "rabbitmq", "mongodb":
		return true
	default:
		return false
	}
}

func valueOrDefault[T any, R any](value *T, selector func(*T) R, fallback R) R {
	if value == nil {
		return fallback
	}
	return selector(value)
}

func valueOrDefaultAny[T any](value *T, selector func(*T) any, fallback any) any {
	if value == nil {
		return fallback
	}
	selected := selector(value)
	if selected == nil {
		return fallback
	}
	return selected
}

func valueOrDefaultMap[T any](value *T, selector func(*T) map[string]string) map[string]string {
	if value == nil {
		return map[string]string{}
	}
	selected := selector(value)
	if selected == nil {
		return map[string]string{}
	}
	return selected
}

func boolOrDefault(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}

var serviceRefPattern = regexp.MustCompile(`\$\{[^}]+\}`)
