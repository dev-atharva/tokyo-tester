package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const protocolVersion = "2025-11-25"
const maxReviewWarnings = 8

var resourceDocs = map[string]struct {
	name     string
	mimeType string
	text     string
}{
	"tokyo://authoring": {
		name:     "Tokyo Tester authoring guidance",
		mimeType: "text/markdown",
		text: strings.TrimSpace(`# Tokyo Tester authoring

1. Discover every relevant repository and map repos to services.
2. Summarize build/image, ports, commands, readiness, env/config, dependencies, data stores, queues/topics, routes, and existing tests.
3. Model readiness from startup/runtime references, not just architecture.
4. Call tokyo_review_workflow_plan with compact summaries before authoring complex or multi-repo bundles.
5. Validate every bundle with tokyo_validate_workflow before import or run.

Do not send source files, raw manifests, logs, or secrets to MCP.`),
	},
	"tokyo://scenario-patterns": {
		name:     "Tokyo Tester scenario patterns",
		mimeType: "text/markdown",
		text: strings.TrimSpace(`# Scenario patterns

- Start with one fast readiness or smoke scenario.
- Add happy-path scenarios crossing service boundaries.
- Pair application actions with direct database, document, cache, or queue assertions for important side effects.
- Include async completion checks for workers and brokers.
- Include negative or validation scenarios only when behavior is evidenced by routes, specs, or tests.

Use stable endpoint paths, topics, schemas, and expected values from repository evidence or user answers.`),
	},
	"tokyo://quality-rubric": {
		name:     "Tokyo Tester quality rubric",
		mimeType: "text/markdown",
		text: strings.TrimSpace(`# Quality rubric

Strong plans include repo provenance per service, build/image evidence, runtime/readiness evidence, dependency edges, direct infra assertions, and explicit open questions.

Weak plans have many services but one smoke test, unevidenced endpoints or topics, untested infra, missing repo provenance, or unresolved assumptions encoded as workflow JSON.

tokyo_review_workflow_plan returns warnings only. Structural validation still comes from tokyo_validate_workflow.`),
	},
}

type Server struct {
	appBaseURL    *url.URL
	client        *http.Client
	allowedOrigin string
	limiter       *rateLimiter
}

type rpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type rpcResponse struct {
	JSONRPC string    `json:"jsonrpc"`
	ID      any       `json:"id,omitempty"`
	Result  any       `json:"result,omitempty"`
	Error   *rpcError `json:"error,omitempty"`
}

type rpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

func New(appBaseURL, allowedOrigin string) (*Server, error) {
	base, err := url.Parse(appBaseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return nil, fmt.Errorf("invalid TOKYO_TESTER_APP_URL")
	}
	return &Server{appBaseURL: base, client: &http.Client{Timeout: 30 * time.Second}, allowedOrigin: strings.TrimSpace(allowedOrigin), limiter: newRateLimiter(120, time.Minute)}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /mcp", s.handleMCP)
	mux.HandleFunc("GET /mcp", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "SSE subscriptions are not enabled; poll tokyo_get_run", http.StatusMethodNotAllowed)
	})
	return s.securityHeaders(mux)
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if origin := r.Header.Get("Origin"); origin != "" && s.allowedOrigin != "" && origin != s.allowedOrigin {
			http.Error(w, "origin is not allowed", http.StatusForbidden)
			return
		}
		if !s.limiter.Allow(clientIP(r)) {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	var request rpcRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		s.writeRPC(w, nil, nil, &rpcError{Code: -32700, Message: "Parse error"})
		return
	}
	if request.JSONRPC != "2.0" {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32600, Message: "Invalid Request"})
		return
	}
	if len(request.ID) == 0 {
		w.WriteHeader(http.StatusAccepted)
		return
	}
	switch request.Method {
	case "initialize":
		negotiated := protocolVersion
		var params struct {
			ProtocolVersion string `json:"protocolVersion"`
		}
		if json.Unmarshal(request.Params, &params) == nil && (params.ProtocolVersion == "2025-06-18" || params.ProtocolVersion == protocolVersion) {
			negotiated = params.ProtocolVersion
		}
		s.writeRPC(w, request.ID, map[string]any{
			"protocolVersion": negotiated,
			"capabilities":    map[string]any{"tools": map[string]bool{"listChanged": false}, "resources": map[string]bool{"subscribe": false, "listChanged": false}},
			"serverInfo":      map[string]string{"name": "tokyo-tester", "version": "0.1.0"},
			"instructions":    "Inspect the user's repository locally. Use Tokyo Tester tools only for capabilities, validation, import, execution, and diagnostics.",
		}, nil)
	case "ping":
		s.writeRPC(w, request.ID, map[string]any{}, nil)
	case "tools/list":
		s.writeRPC(w, request.ID, map[string]any{"tools": tools()}, nil)
	case "tools/call":
		s.callTool(w, r, request)
	case "resources/list":
		s.writeRPC(w, request.ID, map[string]any{"resources": resources()}, nil)
	case "resources/read":
		s.readResource(w, r, request)
	default:
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32601, Message: "Method not found"})
	}
}

func tools() []map[string]any {
	bundle := map[string]any{"type": "object", "description": "Complete cots.workflow-bundle JSON object. Do not include secrets or unevidenced endpoints, topics, schemas, or credentials."}
	stringArray := map[string]any{"type": "array", "description": "Unique non-empty string list.", "items": map[string]any{"type": "string"}, "uniqueItems": true, "minItems": 1}
	reviewArray := map[string]any{"type": "array", "description": "Compact summary objects only; do not include source files, raw manifests, logs, or secrets.", "items": map[string]any{"type": "object", "additionalProperties": true}}
	return []map[string]any{
		tool("tokyo_list_projects", "List the project authorized by the current token; inspect allowedActions before import or run.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_list_workflows", "List persisted workflows available in the authorized workspace.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_get_workflow", "Get one persisted workflow and its selectable scenarios.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id from tokyo_list_workflows.")}, []string{"workflowId"}), true, false, true),
		tool("tokyo_list_workflow_revisions", "List immutable revisions for a persisted workflow.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id.")}, []string{"workflowId"}), true, false, true),
		tool("tokyo_create_workflow_revision", "Save the current workflow and scenarios as an immutable revision. Requires user approval.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "message": stringSchema("Optional short revision message.")}, []string{"workflowId"}), false, false, false),
		tool("tokyo_restore_workflow_revision", "Restore an immutable workflow revision as a new current revision. This is destructive and requires explicit user approval.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "revisionId": stringSchema("Revision id to restore."), "expectedVersion": map[string]any{"type": "integer", "minimum": 1, "description": "Current workflow version guard."}}, []string{"workflowId", "revisionId", "expectedVersion"}), false, true, false),
		tool("tokyo_get_capabilities", "Get compact workflow schema, supported types, authoring rules, limits, and optional tokyo:// resource URIs.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_review_workflow_plan", "Review compact multi-repo research and scenario summaries before authoring complex workflows. Returns warnings only; it never imports, runs, or blocks.", objectSchema(map[string]any{
			"repositories":       reviewArray,
			"serviceInventory":   reviewArray,
			"dependencyMap":      reviewArray,
			"scenarioMatrix":     reviewArray,
			"evidenceNotes":      map[string]any{"type": "array", "description": "Short evidence notes or provenance strings.", "items": map[string]any{"type": "string"}},
			"openQuestions":      map[string]any{"type": "array", "description": "Unresolved questions that should be asked before assumptions become workflow JSON.", "items": map[string]any{"type": "string"}},
			"applicationSummary": stringSchema("Optional short summary of the application cluster."),
		}, []string{"repositories", "serviceInventory", "dependencyMap", "scenarioMatrix"}), true, false, true),
		tool("tokyo_validate_workflow", "Authoritatively validate and normalize a workflow bundle. Call before import or run.", objectSchema(map[string]any{"bundle": bundle}, []string{"bundle"}), true, false, true),
		tool("tokyo_import_workflow", "Import a validated workflow into the authorized project. Requires user approval and a stable idempotency key.", objectSchema(map[string]any{"bundle": bundle, "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same import."}}, []string{"bundle", "idempotencyKey"}), false, true, true),
		tool("tokyo_run_workflow", "Import and execute a workflow in the authorized project. Requires workflow write/run permission, user approval, and a stable idempotency key.", objectSchema(map[string]any{"bundle": bundle, "scenarioNames": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same import-and-run."}}, []string{"bundle", "idempotencyKey"}), false, true, true),
		tool("tokyo_run_existing_workflow", "Execute selected scenarios from a persisted workflow without modifying it. Omit scenarioIds only when the user approves running all scenarios.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "scenarioIds": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same run."}}, []string{"workflowId", "idempotencyKey"}), false, true, true),
		tool("tokyo_get_run", "Poll durable workflow run status and test results.", objectSchema(map[string]any{"workflowRunId": stringSchema("Workflow run id returned by a run tool.")}, []string{"workflowRunId"}), true, false, true),
		tool("tokyo_get_run_diagnostics", "Get redacted workflow, scenario, and test failure diagnostics for repairing a workflow.", objectSchema(map[string]any{"workflowRunId": stringSchema("Workflow run id returned by a run tool.")}, []string{"workflowRunId"}), true, false, true),
	}
}

func tool(name, description string, schema map[string]any, readOnly, destructive, idempotent bool) map[string]any {
	return map[string]any{"name": name, "description": description, "inputSchema": schema, "annotations": map[string]any{"readOnlyHint": readOnly, "destructiveHint": destructive, "idempotentHint": idempotent, "openWorldHint": true}}
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	if properties == nil {
		properties = map[string]any{}
	}
	return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
}

func stringSchema(description string) map[string]any {
	return map[string]any{"type": "string", "description": description}
}

func resources() []map[string]any {
	result := []map[string]any{{
		"uri":      "tokyo://capabilities",
		"name":     "Tokyo Tester capabilities",
		"mimeType": "application/json",
	}}
	for uri, doc := range resourceDocs {
		result = append(result, map[string]any{"uri": uri, "name": doc.name, "mimeType": doc.mimeType})
	}
	return result
}

func (s *Server) callTool(w http.ResponseWriter, r *http.Request, request rpcRequest) {
	var params struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(request.Params, &params); err != nil {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "Invalid tool arguments"})
		return
	}
	method, path, body, idempotency := "GET", "", any(nil), ""
	switch params.Name {
	case "tokyo_review_workflow_plan":
		s.writeToolResult(w, request.ID, reviewWorkflowPlan(params.Arguments), false)
		return
	case "tokyo_list_projects":
		path = "/api/v1/agent/projects"
	case "tokyo_list_workflows":
		path = "/api/v1/agent/workflows"
	case "tokyo_get_workflow":
		workflowID, _ := params.Arguments["workflowId"].(string)
		if workflowID == "" {
			s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "workflowId is required"})
			return
		}
		path = "/api/v1/agent/workflows/" + url.PathEscape(workflowID)
	case "tokyo_list_workflow_revisions", "tokyo_create_workflow_revision", "tokyo_restore_workflow_revision":
		workflowID, _ := params.Arguments["workflowId"].(string)
		if workflowID == "" {
			s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "workflowId is required"})
			return
		}
		path = "/api/v1/agent/workflows/" + url.PathEscape(workflowID) + "/revisions"
		if params.Name == "tokyo_create_workflow_revision" {
			method, body = "POST", map[string]any{"message": params.Arguments["message"]}
		} else if params.Name == "tokyo_restore_workflow_revision" {
			revisionID, _ := params.Arguments["revisionId"].(string)
			expectedVersion, ok := params.Arguments["expectedVersion"].(float64)
			if revisionID == "" || !ok || expectedVersion < 1 {
				s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "revisionId and expectedVersion are required"})
				return
			}
			method = "POST"
			path += "/" + url.PathEscape(revisionID) + "/restore"
			body = map[string]any{"expectedVersion": int(expectedVersion)}
		}
	case "tokyo_get_capabilities":
		path = "/api/v1/agent/capabilities"
	case "tokyo_validate_workflow":
		method, path, body = "POST", "/api/v1/agent/workflows/validate", map[string]any{"bundle": params.Arguments["bundle"]}
	case "tokyo_import_workflow":
		method, path, body = "POST", "/api/v1/agent/workflows/import", map[string]any{"bundle": params.Arguments["bundle"]}
		idempotency, _ = params.Arguments["idempotencyKey"].(string)
	case "tokyo_run_workflow":
		runBody := map[string]any{"bundle": params.Arguments["bundle"]}
		if scenarioNames, ok := params.Arguments["scenarioNames"]; ok {
			runBody["scenarioNames"] = scenarioNames
		}
		method, path, body = "POST", "/api/v1/agent/workflows/run", runBody
		idempotency, _ = params.Arguments["idempotencyKey"].(string)
	case "tokyo_run_existing_workflow":
		workflowID, _ := params.Arguments["workflowId"].(string)
		if workflowID == "" {
			s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "workflowId is required"})
			return
		}
		method = "POST"
		path = "/api/v1/agent/workflows/" + url.PathEscape(workflowID) + "/runs"
		runBody := map[string]any{}
		if scenarioIDs, ok := params.Arguments["scenarioIds"]; ok {
			runBody["scenarioIds"] = scenarioIDs
		}
		body = runBody
		idempotency, _ = params.Arguments["idempotencyKey"].(string)
	case "tokyo_get_run", "tokyo_get_run_diagnostics":
		runID, _ := params.Arguments["workflowRunId"].(string)
		if runID == "" {
			s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "workflowRunId is required"})
			return
		}
		path = "/api/v1/agent/runs/" + url.PathEscape(runID)
		if params.Name == "tokyo_get_run_diagnostics" {
			path += "/diagnostics"
		}
	default:
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "Unknown tool"})
		return
	}
	status, payload, err := s.callApp(r.Context(), r.Header.Get("Authorization"), method, path, body, idempotency)
	if err != nil {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32603, Message: "Tokyo Tester application is unavailable"})
		return
	}
	var structured any
	if json.Unmarshal(payload, &structured) == nil {
		s.writeToolResult(w, request.ID, structured, status < 200 || status >= 300)
		return
	}
	result := map[string]any{"content": []any{map[string]any{"type": "text", "text": string(payload)}}, "isError": status < 200 || status >= 300}
	s.writeRPC(w, request.ID, result, nil)
}

func (s *Server) writeToolResult(w http.ResponseWriter, id json.RawMessage, payload any, isError bool) {
	text := mustJSON(payload)
	s.writeRPC(w, id, map[string]any{
		"content":           []any{map[string]any{"type": "text", "text": text}},
		"structuredContent": payload,
		"isError":           isError,
	}, nil)
}

func (s *Server) readResource(w http.ResponseWriter, r *http.Request, request rpcRequest) {
	var params struct {
		URI string `json:"uri"`
	}
	_ = json.Unmarshal(request.Params, &params)
	if doc, ok := resourceDocs[params.URI]; ok {
		s.writeRPC(w, request.ID, map[string]any{"contents": []any{map[string]any{"uri": params.URI, "mimeType": doc.mimeType, "text": doc.text}}}, nil)
		return
	}
	if params.URI == "tokyo://capabilities" {
		status, payload, err := s.callApp(r.Context(), r.Header.Get("Authorization"), "GET", "/api/v1/agent/capabilities", nil, "")
		if err != nil || status != http.StatusOK {
			s.writeRPC(w, request.ID, nil, &rpcError{Code: -32603, Message: "Unable to read capabilities"})
			return
		}
		s.writeRPC(w, request.ID, map[string]any{"contents": []any{map[string]any{"uri": params.URI, "mimeType": "application/json", "text": string(payload)}}}, nil)
		return
	}
	s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "Unknown resource"})
}

type reviewWarning struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	Suggestion string `json:"suggestion"`
}

func reviewWorkflowPlan(args map[string]any) map[string]any {
	repositories := asObjects(args["repositories"])
	services := asObjects(args["serviceInventory"])
	dependencies := asObjects(args["dependencyMap"])
	scenarios := asObjects(args["scenarioMatrix"])
	evidenceNotes := asStrings(args["evidenceNotes"])
	openQuestions := asStrings(args["openQuestions"])

	warnings := make([]reviewWarning, 0, maxReviewWarnings)
	addWarning := func(code, message, suggestion string) {
		if len(warnings) >= maxReviewWarnings {
			return
		}
		warnings = append(warnings, reviewWarning{Code: code, Message: message, Suggestion: suggestion})
	}

	if len(repositories) == 0 {
		addWarning("missing_repositories", "No repositories summarized.", "Map each repo to owned services.")
	}
	if len(services) == 0 {
		addWarning("missing_services", "No service inventory summarized.", "List app and infra services with evidence.")
	}
	if len(services) > 1 && len(dependencies) == 0 {
		addWarning("missing_dependencies", "No dependency map for multiple services.", "Add relations and readiness implications.")
	}
	if len(scenarios) == 0 {
		addWarning("missing_scenarios", "No scenario matrix summarized.", "Add smoke and behavior scenarios.")
	}
	if len(evidenceNotes) == 0 {
		addWarning("missing_evidence_notes", "No evidence notes provided.", "Add compact provenance notes.")
	}
	if len(openQuestions) > 0 {
		addWarning("open_questions", fmt.Sprintf("%d open question(s) remain.", len(openQuestions)), "Ask before encoding assumptions.")
	}

	servicesWithRepo := 0
	servicesWithRuntime := 0
	genericWithoutBuild := make([]string, 0)
	infraServices := make([]string, 0)
	for _, service := range services {
		name := firstString(service, "name", "service", "label", "id")
		if name == "" {
			name = "unnamed service"
		}
		serviceType := strings.ToLower(firstString(service, "type", "serviceType", "kind"))
		if hasAnyString(service, "repository", "repo", "repoPath", "path", "source") {
			servicesWithRepo++
		}
		if hasAnyString(service, "port", "ports", "containerPort", "command", "env", "readiness", "healthcheck", "health") {
			servicesWithRuntime++
		}
		if serviceType == "generic" || serviceType == "app" || serviceType == "application" || serviceType == "" {
			if !hasAnyString(service, "image", "build", "buildContext", "dockerfile", "buildEvidence") {
				genericWithoutBuild = append(genericWithoutBuild, name)
			}
		}
		if isInfraService(serviceType) {
			infraServices = append(infraServices, name)
		}
	}
	if len(services) > 0 && servicesWithRepo < len(services) {
		addWarning("incomplete_repo_provenance", fmt.Sprintf("%d/%d service(s) have repo provenance.", servicesWithRepo, len(services)), "Add repo/path or open question.")
	}
	if len(services) > 0 && servicesWithRuntime < len(services) {
		addWarning("incomplete_runtime_evidence", fmt.Sprintf("%d/%d service(s) have runtime evidence.", servicesWithRuntime, len(services)), "Add ports, env, command, or readiness.")
	}
	if len(genericWithoutBuild) > 0 {
		addWarning("missing_build_evidence", fmt.Sprintf("Missing build/image evidence: %s.", strings.Join(limitStrings(genericWithoutBuild, 4), ", ")), "Find Dockerfile, build context, or image.")
	}
	if len(services) >= 4 && len(scenarios) < 2 {
		addWarning("thin_complex_scenarios", fmt.Sprintf("%d services but %d scenario(s).", len(services), len(scenarios)), "Add flow, async, and infra scenarios.")
	}

	scenarioText := strings.ToLower(mustJSON(scenarios))
	untestedInfra := make([]string, 0)
	for _, serviceName := range infraServices {
		if !strings.Contains(scenarioText, strings.ToLower(serviceName)) {
			untestedInfra = append(untestedInfra, serviceName)
		}
	}
	if len(untestedInfra) > 0 {
		addWarning("untested_infrastructure", fmt.Sprintf("Infra not referenced: %s.", strings.Join(limitStrings(untestedInfra, 5), ", ")), "Pair app actions with direct infra assertions.")
	}

	status := "ready"
	if len(warnings) > 0 {
		status = "needs_attention"
	}
	nextSteps := []string{"Resolve warnings or record approved assumptions.", "Validate with tokyo_validate_workflow."}
	if len(warnings) == 0 {
		nextSteps = []string{"Author from evidence.", "Validate before import or run approval."}
	}
	return map[string]any{
		"status":       status,
		"warningCount": len(warnings),
		"warnings":     warnings,
		"coverage": map[string]any{
			"repositories":                len(repositories),
			"services":                    len(services),
			"dependencies":                len(dependencies),
			"scenarios":                   len(scenarios),
			"openQuestions":               len(openQuestions),
			"servicesWithRepoEvidence":    servicesWithRepo,
			"servicesWithRuntimeEvidence": servicesWithRuntime,
			"infraServices":               len(infraServices),
		},
		"limits":    map[string]any{"maxWarnings": maxReviewWarnings},
		"nextSteps": nextSteps,
	}
}

func asObjects(value any) []map[string]any {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]map[string]any, 0, len(items))
	for _, item := range items {
		if object, ok := item.(map[string]any); ok {
			result = append(result, object)
		}
	}
	return result
}

func asStrings(value any) []string {
	items, ok := value.([]any)
	if !ok {
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if text, ok := item.(string); ok && strings.TrimSpace(text) != "" {
			result = append(result, strings.TrimSpace(text))
		}
	}
	return result
}

func firstString(object map[string]any, keys ...string) string {
	for _, key := range keys {
		if text, ok := object[key].(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return ""
}

func hasAnyString(object map[string]any, keys ...string) bool {
	for _, key := range keys {
		if hasEvidenceValue(object[key]) {
			return true
		}
	}
	return false
}

func hasEvidenceValue(value any) bool {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed) != ""
	case []any:
		return len(typed) > 0
	case map[string]any:
		return len(typed) > 0
	default:
		return value != nil
	}
}

func isInfraService(serviceType string) bool {
	switch serviceType {
	case "postgres", "mysql", "mariadb", "redis", "memcached", "mongodb", "rabbitmq", "kafka":
		return true
	default:
		return false
	}
}

func limitStrings(values []string, max int) []string {
	if len(values) <= max {
		return values
	}
	result := append([]string{}, values[:max]...)
	result = append(result, fmt.Sprintf("+%d more", len(values)-max))
	return result
}

func mustJSON(value any) string {
	payload, err := json.Marshal(value)
	if err != nil {
		return "{}"
	}
	return string(payload)
}

func (s *Server) callApp(ctx context.Context, authorization, method, path string, body any, idempotency string) (int, []byte, error) {
	var reader io.Reader
	if body != nil {
		encoded, _ := json.Marshal(body)
		reader = bytes.NewReader(encoded)
	}
	target := s.appBaseURL.ResolveReference(&url.URL{Path: path})
	req, err := http.NewRequestWithContext(ctx, method, target.String(), reader)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Authorization", authorization)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if idempotency != "" {
		req.Header.Set("Idempotency-Key", idempotency)
	}
	response, err := s.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 4<<20))
	return response.StatusCode, payload, err
}

func (s *Server) writeRPC(w http.ResponseWriter, id json.RawMessage, result any, rpcErr *rpcError) {
	var decodedID any
	if len(id) > 0 {
		_ = json.Unmarshal(id, &decodedID)
	}
	writeJSON(w, http.StatusOK, rpcResponse{JSONRPC: "2.0", ID: decodedID, Result: result, Error: rpcErr})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func clientIP(r *http.Request) string {
	if forwarded := strings.TrimSpace(strings.Split(r.Header.Get("X-Forwarded-For"), ",")[0]); forwarded != "" {
		return forwarded
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

type rateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	clients map[string]*rateWindow
}
type rateWindow struct {
	started time.Time
	count   int
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, clients: make(map[string]*rateWindow)}
}
func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	value := l.clients[key]
	if value == nil || now.Sub(value.started) >= l.window {
		l.clients[key] = &rateWindow{started: now, count: 1}
		return true
	}
	if value.count >= l.limit {
		return false
	}
	value.count++
	return true
}
