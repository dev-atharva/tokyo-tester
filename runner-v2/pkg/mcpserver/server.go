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
		s.writeRPC(w, request.ID, map[string]any{"resources": []any{map[string]any{"uri": "tokyo://capabilities", "name": "Tokyo Tester capabilities", "mimeType": "application/json"}}}, nil)
	case "resources/read":
		s.readResource(w, r, request)
	default:
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32601, Message: "Method not found"})
	}
}

func tools() []map[string]any {
	bundle := map[string]any{"type": "object", "description": "A complete cots.workflow-bundle JSON object"}
	stringArray := map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "uniqueItems": true, "minItems": 1}
	return []map[string]any{
		tool("tokyo_list_projects", "List the project authorized by the current token.", objectSchema(nil, nil), true, false),
		tool("tokyo_list_workflows", "List persisted workflows available in the authorized workspace.", objectSchema(nil, nil), true, false),
		tool("tokyo_get_workflow", "Get one persisted workflow and its selectable scenarios.", objectSchema(map[string]any{"workflowId": map[string]any{"type": "string"}}, []string{"workflowId"}), true, false),
		tool("tokyo_get_capabilities", "Get current workflow schema version, service types, test types, edge semantics, and limits before authoring.", objectSchema(nil, nil), true, false),
		tool("tokyo_validate_workflow", "Authoritatively validate and normalize a workflow bundle. Call before import or run.", objectSchema(map[string]any{"bundle": bundle}, []string{"bundle"}), true, false),
		tool("tokyo_import_workflow", "Import a validated workflow into the authorized project. This changes persisted state and requires user approval.", objectSchema(map[string]any{"bundle": bundle, "idempotencyKey": map[string]any{"type": "string", "minLength": 8}}, []string{"bundle", "idempotencyKey"}), false, true),
		tool("tokyo_run_workflow", "Import and execute a workflow in the authorized project. Requires workflow write and run permission plus user approval.", objectSchema(map[string]any{"bundle": bundle, "scenarioNames": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8}}, []string{"bundle", "idempotencyKey"}), false, true),
		tool("tokyo_run_existing_workflow", "Execute selected scenarios from a persisted workflow without modifying it. Omit scenarioIds to run all scenarios. Requires user approval.", objectSchema(map[string]any{"workflowId": map[string]any{"type": "string"}, "scenarioIds": stringArray, "idempotencyKey": map[string]any{"type": "string", "minLength": 8}}, []string{"workflowId", "idempotencyKey"}), false, true),
		tool("tokyo_get_run", "Poll durable workflow run status and test results.", objectSchema(map[string]any{"workflowRunId": map[string]any{"type": "string"}}, []string{"workflowRunId"}), true, false),
		tool("tokyo_get_run_diagnostics", "Get redacted workflow, scenario, and test failure diagnostics for repairing a workflow.", objectSchema(map[string]any{"workflowRunId": map[string]any{"type": "string"}}, []string{"workflowRunId"}), true, false),
	}
}

func tool(name, description string, schema map[string]any, readOnly, destructive bool) map[string]any {
	return map[string]any{"name": name, "description": description, "inputSchema": schema, "annotations": map[string]any{"readOnlyHint": readOnly, "destructiveHint": destructive, "idempotentHint": true, "openWorldHint": true}}
}

func objectSchema(properties map[string]any, required []string) map[string]any {
	if properties == nil {
		properties = map[string]any{}
	}
	return map[string]any{"type": "object", "properties": properties, "required": required, "additionalProperties": false}
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
	text := string(payload)
	result := map[string]any{"content": []any{map[string]any{"type": "text", "text": text}}, "isError": status < 200 || status >= 300}
	var structured any
	if json.Unmarshal(payload, &structured) == nil {
		result["structuredContent"] = structured
	}
	s.writeRPC(w, request.ID, result, nil)
}

func (s *Server) readResource(w http.ResponseWriter, r *http.Request, request rpcRequest) {
	var params struct {
		URI string `json:"uri"`
	}
	_ = json.Unmarshal(request.Params, &params)
	if params.URI != "tokyo://capabilities" {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32602, Message: "Unknown resource"})
		return
	}
	status, payload, err := s.callApp(r.Context(), r.Header.Get("Authorization"), "GET", "/api/v1/agent/capabilities", nil, "")
	if err != nil || status != http.StatusOK {
		s.writeRPC(w, request.ID, nil, &rpcError{Code: -32603, Message: "Unable to read capabilities"})
		return
	}
	s.writeRPC(w, request.ID, map[string]any{"contents": []any{map[string]any{"uri": params.URI, "mimeType": "application/json", "text": string(payload)}}}, nil)
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
