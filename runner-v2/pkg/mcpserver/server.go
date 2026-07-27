package mcpserver

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"
)

const protocolVersion = "2025-11-25"
const maxReviewWarnings = 8
const maxMCPRequestBytes = 10 << 20

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
6. Use the returned normalized bundle and validationReceipt unchanged. Any edit requires validation again.

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
	appBaseURL            *url.URL
	publicMCPURL          *url.URL
	oauthIssuer           string
	oauthIntrospectionURL string
	oauthClientID         string
	oauthClientSecret     string
	internalSecret        string
	authMode              string
	client                *http.Client
	allowedOrigins        map[string]struct{}
	limiter               *rateLimiter
}

type Config struct {
	AppBaseURL            string
	PublicMCPURL          string
	AllowedOrigins        string
	AuthMode              string
	OAuthIssuer           string
	OAuthIntrospectionURL string
	OAuthClientID         string
	OAuthClientSecret     string
	InternalSecret        string
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

func New(config Config) (*Server, error) {
	base, err := url.Parse(config.AppBaseURL)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return nil, fmt.Errorf("invalid TOKYO_TESTER_APP_URL")
	}
	publicURL, err := url.Parse(config.PublicMCPURL)
	if err != nil || publicURL.Scheme == "" || publicURL.Host == "" || strings.TrimSuffix(publicURL.Path, "/") != "/mcp" {
		return nil, fmt.Errorf("invalid MCP_PUBLIC_URL")
	}
	mode := strings.TrimSpace(config.AuthMode)
	if mode != "personal_token" && mode != "oauth" {
		return nil, fmt.Errorf("MCP_AUTH_MODE must be personal_token or oauth")
	}
	if len(config.InternalSecret) < 32 {
		return nil, fmt.Errorf("MCP_INTERNAL_SECRET must contain at least 32 characters")
	}
	if mode == "oauth" {
		issuer, issuerErr := url.Parse(config.OAuthIssuer)
		introspection, introspectionErr := url.Parse(config.OAuthIntrospectionURL)
		if issuerErr != nil || issuer.Scheme != "https" || issuer.Host == "" {
			return nil, fmt.Errorf("MCP_OAUTH_ISSUER must be an HTTPS URL")
		}
		if introspectionErr != nil || introspection.Scheme != "https" || introspection.Host == "" {
			return nil, fmt.Errorf("MCP_OAUTH_INTROSPECTION_URL must be an HTTPS URL")
		}
		if config.OAuthClientID == "" || config.OAuthClientSecret == "" {
			return nil, fmt.Errorf("MCP OAuth client credentials must be set")
		}
	}
	origins := make(map[string]struct{})
	for _, origin := range strings.Split(config.AllowedOrigins, ",") {
		if trimmed := strings.TrimSpace(origin); trimmed != "" {
			origins[trimmed] = struct{}{}
		}
	}
	return &Server{
		appBaseURL:            base,
		publicMCPURL:          publicURL,
		oauthIssuer:           strings.TrimSuffix(config.OAuthIssuer, "/"),
		oauthIntrospectionURL: config.OAuthIntrospectionURL,
		oauthClientID:         config.OAuthClientID,
		oauthClientSecret:     config.OAuthClientSecret,
		internalSecret:        config.InternalSecret,
		authMode:              mode,
		client:                &http.Client{Timeout: 30 * time.Second},
		allowedOrigins:        origins,
		limiter:               newRateLimiter(120, time.Minute),
	}, nil
}

func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	healthHandler := func(w http.ResponseWriter, r *http.Request) {
		status, _, err := s.callAppHealth(r.Context())
		if err != nil || status != http.StatusOK {
			writeHealthResponse(w, r, http.StatusServiceUnavailable, map[string]string{"status": "unavailable"})
			return
		}
		writeHealthResponse(w, r, http.StatusOK, map[string]string{"status": "ready"})
	}
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("HEAD /health", healthHandler)
	mux.HandleFunc("POST /mcp", s.handleMCP)
	mux.HandleFunc("POST /mcp/projects/{projectID}", s.handleMCP)
	mux.HandleFunc("OPTIONS /mcp", s.handleOptions)
	mux.HandleFunc("OPTIONS /mcp/projects/{projectID}", s.handleOptions)
	mux.HandleFunc("GET /mcp", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "SSE subscriptions are not enabled; poll tokyo_get_run", http.StatusMethodNotAllowed)
	})
	mux.HandleFunc("GET /mcp/projects/{projectID}", func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "SSE subscriptions are not enabled; poll tokyo_get_run", http.StatusMethodNotAllowed)
	})
	return s.securityHeaders(mux)
}

func writeHealthResponse(w http.ResponseWriter, r *http.Request, status int, value any) {
	if r.Method == http.MethodHead {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		return
	}
	writeJSON(w, status, value)
}

func (s *Server) handleOptions(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, MCP-Protocol-Version")
	w.Header().Set("Access-Control-Max-Age", "600")
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if origin := strings.TrimSpace(r.Header.Get("Origin")); origin != "" {
			if _, allowed := s.allowedOrigins[origin]; !allowed {
				http.Error(w, "origin is not allowed", http.StatusForbidden)
				return
			}
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Expose-Headers", "MCP-Protocol-Version, WWW-Authenticate")
		}
		if strings.HasPrefix(r.URL.Path, "/mcp") && r.Method != http.MethodOptions && !s.limiter.Allow(rateLimitKey(r)) {
			w.Header().Set("Retry-After", "60")
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxMCPRequestBytes)
	var request rpcRequest
	if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
		s.writeRPC(w, nil, nil, &rpcError{Code: -32700, Message: "Parse error"})
		return
	}
	if request.JSONRPC != "2.0" {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32600, Message: "Invalid Request"})
		return
	}
	if request.Method != "initialize" {
		version := strings.TrimSpace(r.Header.Get("MCP-Protocol-Version"))
		if version == "" {
			http.Error(w, "MCP-Protocol-Version is required after initialization", http.StatusBadRequest)
			return
		}
		if version != "2025-03-26" && version != "2025-06-18" && version != protocolVersion {
			http.Error(w, "unsupported MCP-Protocol-Version", http.StatusBadRequest)
			return
		}
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
		if json.Unmarshal(request.Params, &params) == nil && (params.ProtocolVersion == "2025-03-26" || params.ProtocolVersion == "2025-06-18" || params.ProtocolVersion == protocolVersion) {
			negotiated = params.ProtocolVersion
		}
		s.writeRPC(w, request.ID, map[string]any{
			"protocolVersion": negotiated,
			"capabilities":    map[string]any{"tools": map[string]bool{"listChanged": false}, "resources": map[string]bool{"subscribe": false, "listChanged": false}},
			"serverInfo":      map[string]string{"name": "tokyo-tester", "version": "1.0.0"},
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
	bundle := workflowBundleToolSchema()
	stringArray := map[string]any{"type": "array", "description": "Unique non-empty string list.", "items": map[string]any{"type": "string"}, "uniqueItems": true, "minItems": 1}
	reviewSchemas := reviewItemSchemas()
	return []map[string]any{
		tool("tokyo_list_projects", "List the project authorized by the current token; inspect allowedActions before import or run.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_list_workflows", "List persisted workflows available in the authorized workspace.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_get_workflow", "Get one persisted workflow and its selectable scenarios.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id from tokyo_list_workflows.")}, []string{"workflowId"}), true, false, true),
		tool("tokyo_list_workflow_revisions", "List immutable revisions for a persisted workflow.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id.")}, []string{"workflowId"}), true, false, true),
		tool("tokyo_create_workflow_revision", "Save the current workflow and scenarios as an immutable revision. Requires user approval.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "message": stringSchema("Optional short revision message.")}, []string{"workflowId"}), false, false, false),
		tool("tokyo_restore_workflow_revision", "Restore an immutable workflow revision as a new current revision. This is destructive and requires explicit user approval.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "revisionId": stringSchema("Revision id to restore."), "expectedVersion": map[string]any{"type": "integer", "minimum": 1, "description": "Current workflow version guard."}}, []string{"workflowId", "revisionId", "expectedVersion"}), false, true, false),
		tool("tokyo_get_capabilities", "Get compact workflow schema, supported types, authoring rules, limits, and optional tokyo:// resource URIs.", objectSchema(nil, nil), true, false, true),
		tool("tokyo_review_workflow_plan", "Review compact multi-repo research and scenario summaries before authoring complex workflows. Returns warnings only; it never imports, runs, or blocks.", objectSchema(map[string]any{
			"repositories":       reviewSchemas["repositories"],
			"serviceInventory":   reviewSchemas["serviceInventory"],
			"dependencyMap":      reviewSchemas["dependencyMap"],
			"scenarioMatrix":     reviewSchemas["scenarioMatrix"],
			"evidenceNotes":      map[string]any{"type": "array", "description": "Short evidence notes or provenance strings.", "items": map[string]any{"type": "string"}},
			"openQuestions":      map[string]any{"type": "array", "description": "Unresolved questions that should be asked before assumptions become workflow JSON.", "items": map[string]any{"type": "string"}},
			"applicationSummary": stringSchema("Optional short summary of the application cluster."),
		}, []string{"repositories", "serviceInventory", "dependencyMap", "scenarioMatrix"}), true, false, true),
		tool("tokyo_validate_workflow", "Authoritatively validate and normalize a workflow bundle. Call before import or run.", objectSchema(map[string]any{"bundle": bundle}, []string{"bundle"}), true, false, true),
		tool("tokyo_import_workflow", "Import an exactly validated workflow into the authorized project. Requires the unexpired validationReceipt returned for this bundle, user approval, and a stable idempotency key.", objectSchema(map[string]any{"bundle": bundle, "validationReceipt": validationReceiptSchema(), "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same import."}}, []string{"bundle", "validationReceipt", "idempotencyKey"}), false, true, true),
		tool("tokyo_run_workflow", "Import and execute an exactly validated workflow in the authorized project. Requires the unexpired validationReceipt returned for this bundle, workflow write/run permission, user approval, and a stable idempotency key.", objectSchema(map[string]any{"bundle": bundle, "validationReceipt": validationReceiptSchema(), "scenarioNames": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same import-and-run."}}, []string{"bundle", "validationReceipt", "idempotencyKey"}), false, true, true),
		tool("tokyo_run_existing_workflow", "Execute selected scenarios from a persisted workflow without modifying it. Omit scenarioIds only when the user approves running all scenarios.", objectSchema(map[string]any{"workflowId": stringSchema("Persisted workflow id."), "scenarioIds": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8, "description": "Stable key reused only for retrying the same run."}}, []string{"workflowId", "idempotencyKey"}), false, true, true),
		tool("tokyo_get_run", "Poll durable workflow run status and test results.", objectSchema(map[string]any{"workflowRunId": stringSchema("Workflow run id returned by a run tool.")}, []string{"workflowRunId"}), true, false, true),
		tool("tokyo_get_run_diagnostics", "Get redacted workflow, scenario, and test failure diagnostics for repairing a workflow.", objectSchema(map[string]any{"workflowRunId": stringSchema("Workflow run id returned by a run tool.")}, []string{"workflowRunId"}), true, false, true),
	}
}

func tool(name, description string, schema map[string]any, readOnly, destructive, idempotent bool) map[string]any {
	return map[string]any{"name": name, "description": description, "inputSchema": schema, "outputSchema": genericToolOutputSchema(), "annotations": map[string]any{"readOnlyHint": readOnly, "destructiveHint": destructive, "idempotentHint": idempotent, "openWorldHint": true}}
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
	resourceURIs := make([]string, 0, len(resourceDocs))
	for uri := range resourceDocs {
		resourceURIs = append(resourceURIs, uri)
	}
	sort.Strings(resourceURIs)
	for _, uri := range resourceURIs {
		doc := resourceDocs[uri]
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
	requiredScopes := toolScopes(params.Name)
	assertion, ok := s.authenticateRequest(w, r, requiredScopes...)
	if !ok {
		return
	}
	if message := validateToolArguments(params.Name, params.Arguments); message != "" {
		s.writeToolResult(w, request.ID, map[string]any{"error": message}, true)
		return
	}
	if params.Name == "tokyo_import_workflow" || params.Name == "tokyo_run_workflow" {
		receipt, _ := params.Arguments["validationReceipt"].(string)
		if err := s.verifyValidationReceipt(receipt, params.Arguments["bundle"], time.Now()); err != nil {
			s.writeToolResult(w, request.ID, map[string]any{"error": err.Error(), "nextStep": "Call tokyo_validate_workflow with the exact bundle, then retry with its validationReceipt after user approval."}, true)
			return
		}
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
		path = "/api/v1/agent/workflows/" + url.PathEscape(workflowID)
	case "tokyo_list_workflow_revisions", "tokyo_create_workflow_revision", "tokyo_restore_workflow_revision":
		workflowID, _ := params.Arguments["workflowId"].(string)
		path = "/api/v1/agent/workflows/" + url.PathEscape(workflowID) + "/revisions"
		if params.Name == "tokyo_create_workflow_revision" {
			method, body = "POST", map[string]any{"message": params.Arguments["message"]}
		} else if params.Name == "tokyo_restore_workflow_revision" {
			revisionID, _ := params.Arguments["revisionId"].(string)
			expectedVersion, _ := params.Arguments["expectedVersion"].(float64)
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
		path = "/api/v1/agent/runs/" + url.PathEscape(runID)
		if params.Name == "tokyo_get_run_diagnostics" {
			path += "/diagnostics"
		}
	default:
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "Unknown tool"})
		return
	}
	status, payload, err := s.callApp(r.Context(), assertion, method, path, body, idempotency)
	if err != nil {
		s.writeToolResult(w, request.ID, map[string]any{"error": "Tokyo Tester application is unavailable. Retry after the service is healthy."}, true)
		return
	}
	var structured any
	if json.Unmarshal(payload, &structured) == nil {
		if params.Name == "tokyo_validate_workflow" && status >= 200 && status < 300 {
			object, objectOK := structured.(map[string]any)
			normalizedBundle, bundleOK := object["bundle"]
			if !objectOK || !bundleOK {
				s.writeToolResult(w, request.ID, map[string]any{"error": "Tokyo Tester validation returned no normalized bundle."}, true)
				return
			}
			receipt, receiptErr := s.issueValidationReceipt(normalizedBundle, time.Now())
			if receiptErr != nil {
				s.writeToolResult(w, request.ID, map[string]any{"error": "Unable to issue a validation receipt. Validate again."}, true)
				return
			}
			object["validationReceipt"] = receipt
			object["validationReceiptExpiresInSeconds"] = int(validationReceiptTTL.Seconds())
		}
		s.writeToolResult(w, request.ID, structured, status < 200 || status >= 300)
		return
	}
	result := map[string]any{"content": []any{map[string]any{"type": "text", "text": string(payload)}}, "isError": status < 200 || status >= 300}
	s.writeRPC(w, request.ID, result, nil)
}

func validateToolArguments(name string, args map[string]any) string {
	if args == nil {
		args = map[string]any{}
	}
	allowed := map[string][]string{
		"tokyo_list_projects": {}, "tokyo_list_workflows": {}, "tokyo_get_capabilities": {},
		"tokyo_get_workflow": {"workflowId"}, "tokyo_list_workflow_revisions": {"workflowId"},
		"tokyo_create_workflow_revision":  {"workflowId", "message"},
		"tokyo_restore_workflow_revision": {"workflowId", "revisionId", "expectedVersion"},
		"tokyo_review_workflow_plan":      {"repositories", "serviceInventory", "dependencyMap", "scenarioMatrix", "evidenceNotes", "openQuestions", "applicationSummary"},
		"tokyo_validate_workflow":         {"bundle"}, "tokyo_import_workflow": {"bundle", "validationReceipt", "idempotencyKey"},
		"tokyo_run_workflow":          {"bundle", "validationReceipt", "scenarioNames", "idempotencyKey"},
		"tokyo_run_existing_workflow": {"workflowId", "scenarioIds", "idempotencyKey"},
		"tokyo_get_run":               {"workflowRunId"}, "tokyo_get_run_diagnostics": {"workflowRunId"},
	}
	keys, known := allowed[name]
	if !known {
		return ""
	}
	allowedSet := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		allowedSet[key] = struct{}{}
	}
	for key := range args {
		if _, ok := allowedSet[key]; !ok {
			return fmt.Sprintf("Unexpected argument %q. Remove fields not declared by the tool schema.", key)
		}
	}
	requireString := func(key string) string {
		value, ok := args[key].(string)
		if !ok || strings.TrimSpace(value) == "" {
			return fmt.Sprintf("%s is required and must be a non-empty string.", key)
		}
		return ""
	}
	requireObject := func(key string) string {
		value, ok := args[key].(map[string]any)
		if !ok || value == nil {
			return fmt.Sprintf("%s is required and must be a JSON object.", key)
		}
		return ""
	}
	validateStringArray := func(key string) string {
		value, exists := args[key]
		if !exists {
			return ""
		}
		items, ok := value.([]any)
		if !ok || len(items) == 0 {
			return fmt.Sprintf("%s must be a non-empty array of unique strings.", key)
		}
		seen := map[string]struct{}{}
		for _, item := range items {
			text, ok := item.(string)
			if !ok || strings.TrimSpace(text) == "" {
				return fmt.Sprintf("%s must contain only non-empty strings.", key)
			}
			if _, duplicate := seen[text]; duplicate {
				return fmt.Sprintf("%s must not contain duplicate values.", key)
			}
			seen[text] = struct{}{}
		}
		return ""
	}
	switch name {
	case "tokyo_get_workflow", "tokyo_list_workflow_revisions", "tokyo_create_workflow_revision", "tokyo_restore_workflow_revision", "tokyo_run_existing_workflow":
		if message := requireString("workflowId"); message != "" {
			return message
		}
	case "tokyo_get_run", "tokyo_get_run_diagnostics":
		return requireString("workflowRunId")
	}
	if name == "tokyo_create_workflow_revision" {
		if value, exists := args["message"]; exists {
			if _, ok := value.(string); !ok {
				return "message must be a string when provided."
			}
		}
	}
	if name == "tokyo_restore_workflow_revision" {
		if message := requireString("revisionId"); message != "" {
			return message
		}
		value, ok := args["expectedVersion"].(float64)
		if !ok || value < 1 || math.Trunc(value) != value {
			return "expectedVersion is required and must be a positive integer."
		}
	}
	if name == "tokyo_validate_workflow" || name == "tokyo_import_workflow" || name == "tokyo_run_workflow" {
		if message := requireObject("bundle"); message != "" {
			return message
		}
	}
	if name == "tokyo_import_workflow" || name == "tokyo_run_workflow" || name == "tokyo_run_existing_workflow" {
		key, ok := args["idempotencyKey"].(string)
		if !ok || len(strings.TrimSpace(key)) < 8 || len(strings.TrimSpace(key)) > 200 {
			return "idempotencyKey is required and must contain 8-200 characters."
		}
	}
	if name == "tokyo_import_workflow" || name == "tokyo_run_workflow" {
		if message := requireString("validationReceipt"); message != "" {
			return message
		}
	}
	if message := validateStringArray("scenarioNames"); message != "" {
		return message
	}
	if message := validateStringArray("scenarioIds"); message != "" {
		return message
	}
	if name == "tokyo_review_workflow_plan" {
		for _, key := range []string{"repositories", "serviceInventory", "dependencyMap", "scenarioMatrix"} {
			if _, ok := args[key].([]any); !ok {
				return fmt.Sprintf("%s is required and must be an array.", key)
			}
		}
	}
	return ""
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
		assertion, ok := s.authenticateRequest(w, r, "read")
		if !ok {
			return
		}
		status, payload, err := s.callApp(r.Context(), assertion, "GET", "/api/v1/agent/capabilities", nil, "")
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

type introspectionResponse struct {
	Active    bool     `json:"active"`
	Subject   string   `json:"sub"`
	Email     string   `json:"email"`
	UserID    string   `json:"user_id"`
	ProjectID string   `json:"project_id"`
	Scope     string   `json:"scope"`
	Scopes    []string `json:"scopes"`
	Audience  any      `json:"aud"`
}

func bearerToken(r *http.Request) string {
	authorization := strings.TrimSpace(r.Header.Get("Authorization"))
	if !strings.HasPrefix(authorization, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(authorization, "Bearer "))
}

func (s *Server) authenticateRequest(w http.ResponseWriter, r *http.Request, requiredScopes ...string) (string, bool) {
	token := bearerToken(r)
	if token == "" {
		s.writeUnauthorized(w, r, "A Bearer access token is required.", requiredScopes)
		return "", false
	}
	projectID := strings.TrimSpace(r.PathValue("projectID"))
	if s.authMode == "oauth" && projectID == "" {
		http.Error(w, "OAuth connections must use /mcp/projects/{projectId}", http.StatusBadRequest)
		return "", false
	}
	claims, err := s.introspectToken(r.Context(), token)
	if err != nil {
		s.writeUnauthorized(w, r, "The access token is invalid or expired.", requiredScopes)
		return "", false
	}
	if s.authMode == "personal_token" {
		if claims.ProjectID == "" {
			s.writeUnauthorized(w, r, "The personal token is not project scoped.", requiredScopes)
			return "", false
		}
		if projectID != "" && projectID != claims.ProjectID {
			s.writeUnauthorized(w, r, "The token is not valid for this project.", requiredScopes)
			return "", false
		}
		projectID = claims.ProjectID
	} else {
		resource := s.resourceURL(projectID)
		if !audienceContains(claims.Audience, resource) {
			s.writeUnauthorized(w, r, "The access token audience does not match this MCP resource.", requiredScopes)
			return "", false
		}
		if claims.Email == "" || claims.Subject == "" {
			s.writeUnauthorized(w, r, "The authorization server must provide sub and email claims.", requiredScopes)
			return "", false
		}
	}
	scopes := normalizeScopes(claims)
	if len(scopes) == 0 {
		s.writeUnauthorized(w, r, "The access token has no supported Tokyo Tester scopes.", requiredScopes)
		return "", false
	}
	if missing := missingScopes(scopes, requiredScopes); len(missing) > 0 {
		s.writeForbidden(w, r, missing)
		return "", false
	}
	assertion, err := s.signAssertion(claims, projectID, scopes)
	if err != nil {
		http.Error(w, "unable to establish the internal authorization context", http.StatusServiceUnavailable)
		return "", false
	}
	return assertion, true
}

func toolScopes(name string) []string {
	switch name {
	case "tokyo_create_workflow_revision", "tokyo_restore_workflow_revision", "tokyo_import_workflow":
		return []string{"workflow:write"}
	case "tokyo_run_workflow":
		return []string{"workflow:write", "run"}
	case "tokyo_run_existing_workflow":
		return []string{"run"}
	default:
		return []string{"read"}
	}
}

func missingScopes(granted, required []string) []string {
	available := make(map[string]struct{}, len(granted))
	for _, scope := range granted {
		available[scope] = struct{}{}
	}
	missing := make([]string, 0, len(required))
	for _, scope := range required {
		if _, ok := available[scope]; !ok {
			missing = append(missing, scope)
		}
	}
	return missing
}

func (s *Server) introspectToken(ctx context.Context, token string) (introspectionResponse, error) {
	var endpoint string
	var body io.Reader
	if s.authMode == "oauth" {
		endpoint = s.oauthIntrospectionURL
		form := url.Values{"token": []string{token}, "token_type_hint": []string{"access_token"}}
		body = strings.NewReader(form.Encode())
	} else {
		endpoint = s.appBaseURL.ResolveReference(&url.URL{Path: "/api/v1/agent/introspect"}).String()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, body)
	if err != nil {
		return introspectionResponse{}, err
	}
	if s.authMode == "oauth" {
		req.SetBasicAuth(s.oauthClientID, s.oauthClientSecret)
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	} else {
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("X-Tokyo-MCP-Secret", s.internalSecret)
	}
	response, err := s.client.Do(req)
	if err != nil {
		return introspectionResponse{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return introspectionResponse{}, fmt.Errorf("introspection returned %d", response.StatusCode)
	}
	var claims introspectionResponse
	if err := json.NewDecoder(io.LimitReader(response.Body, 1<<20)).Decode(&claims); err != nil {
		return claims, err
	}
	if !claims.Active {
		return claims, fmt.Errorf("inactive token")
	}
	return claims, nil
}

func normalizeScopes(claims introspectionResponse) []string {
	values := append([]string{}, claims.Scopes...)
	values = append(values, strings.Fields(claims.Scope)...)
	allowed := map[string]struct{}{"read": {}, "workflow:write": {}, "run": {}}
	seen := map[string]struct{}{}
	result := make([]string, 0, 3)
	for _, value := range values {
		if _, ok := allowed[value]; !ok {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func audienceContains(value any, expected string) bool {
	switch typed := value.(type) {
	case string:
		return typed == expected
	case []any:
		for _, item := range typed {
			if text, ok := item.(string); ok && text == expected {
				return true
			}
		}
	case []string:
		for _, item := range typed {
			if item == expected {
				return true
			}
		}
	}
	return false
}

func (s *Server) resourceURL(projectID string) string {
	copy := *s.publicMCPURL
	copy.Path = strings.TrimSuffix(copy.Path, "/")
	if projectID != "" {
		copy.Path += "/projects/" + url.PathEscape(projectID)
	}
	copy.RawQuery, copy.Fragment = "", ""
	return copy.String()
}

func (s *Server) metadataURL(projectID string) string {
	resource, _ := url.Parse(s.resourceURL(projectID))
	return (&url.URL{Scheme: resource.Scheme, Host: resource.Host, Path: "/.well-known/oauth-protected-resource" + resource.Path}).String()
}

func (s *Server) writeUnauthorized(w http.ResponseWriter, r *http.Request, message string, scopes []string) {
	challenge := `Bearer realm="tokyo-tester"`
	if s.authMode == "oauth" {
		challenge += fmt.Sprintf(`, resource_metadata="%s", scope="%s"`, s.metadataURL(strings.TrimSpace(r.PathValue("projectID"))), strings.Join(scopes, " "))
	}
	w.Header().Set("WWW-Authenticate", challenge)
	writeJSON(w, http.StatusUnauthorized, map[string]any{"jsonrpc": "2.0", "error": map[string]any{"code": -32001, "message": message}, "id": nil})
}

func (s *Server) writeForbidden(w http.ResponseWriter, r *http.Request, scopes []string) {
	challenge := fmt.Sprintf(`Bearer realm="tokyo-tester", error="insufficient_scope", scope="%s"`, strings.Join(scopes, " "))
	if s.authMode == "oauth" {
		challenge += fmt.Sprintf(`, resource_metadata="%s"`, s.metadataURL(strings.TrimSpace(r.PathValue("projectID"))))
	}
	w.Header().Set("WWW-Authenticate", challenge)
	writeJSON(w, http.StatusForbidden, map[string]any{"jsonrpc": "2.0", "error": map[string]any{"code": -32003, "message": "The access token does not grant the required scope."}, "id": nil})
}

func (s *Server) signAssertion(claims introspectionResponse, projectID string, scopes []string) (string, error) {
	now := time.Now().Unix()
	headerBytes, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload := map[string]any{
		"sub": claims.Subject, "email": strings.ToLower(strings.TrimSpace(claims.Email)), "project_id": projectID,
		"scopes": scopes, "iss": "tokyo-mcp", "aud": "tokyo-ui-agent-api", "iat": now, "exp": now + 60,
	}
	if claims.UserID != "" {
		payload["user_id"] = claims.UserID
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	encodedHeader := base64.RawURLEncoding.EncodeToString(headerBytes)
	encodedPayload := base64.RawURLEncoding.EncodeToString(payloadBytes)
	input := encodedHeader + "." + encodedPayload
	mac := hmac.New(sha256.New, []byte(s.internalSecret))
	_, _ = mac.Write([]byte(input))
	return input + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (s *Server) callAppHealth(ctx context.Context) (int, []byte, error) {
	target := s.appBaseURL.ResolveReference(&url.URL{Path: "/api/health"})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target.String(), nil)
	if err != nil {
		return 0, nil, err
	}
	response, err := s.client.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer response.Body.Close()
	payload, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	return response.StatusCode, payload, err
}

func (s *Server) callApp(ctx context.Context, assertion, method, path string, body any, idempotency string) (int, []byte, error) {
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
	req.Header.Set("X-Tokyo-Agent-Assertion", assertion)
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
	w.Header().Set("MCP-Protocol-Version", protocolVersion)
	writeJSON(w, http.StatusOK, rpcResponse{JSONRPC: "2.0", ID: decodedID, Result: result, Error: rpcErr})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func directClientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func rateLimitKey(r *http.Request) string {
	if token := bearerToken(r); token != "" {
		digest := sha256.Sum256([]byte(token))
		return "token:" + base64.RawURLEncoding.EncodeToString(digest[:])
	}
	return "ip:" + directClientIP(r)
}

type rateLimiter struct {
	mu        sync.Mutex
	limit     int
	window    time.Duration
	clients   map[string]*rateWindow
	lastSweep time.Time
}
type rateWindow struct {
	started time.Time
	count   int
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{limit: limit, window: window, clients: make(map[string]*rateWindow), lastSweep: time.Now()}
}
func (l *rateLimiter) Allow(key string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	if now.Sub(l.lastSweep) >= l.window {
		for client, value := range l.clients {
			if now.Sub(value.started) >= l.window {
				delete(l.clients, client)
			}
		}
		l.lastSweep = now
	}
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
