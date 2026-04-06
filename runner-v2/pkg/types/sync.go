package types

import (
	"encoding/json"
	"time"
)

// --- Request and Response Types ---

type SyncBatchRequest struct {
	ClientID  string       `json:"client_id"`
	UserID    string       `json:"user_id"`
	ProjectID string       `json:"project_id"`
	TimeStamp time.Time    `json:"timestamp"`
	Changes   []SyncChange `json:"changes"`
}

type SyncBatchResponse struct {
	Success        bool           `json:"success"`
	ProcessedCount int            `json:"processed_count"`
	Conflicts      []ConflictInfo `json:"conflicts"`
	Errors         []SyncError    `json:"errors,omitempty"`
	ServerVersion  int            `json:"server_version"`
}

type SyncStatusResponse struct {
	Status        string    `json:"status"` // healthy/degraded/down
	ServerVersion int       `json:"server_version"`
	TimeStamp     time.Time `json:"timestamp"`
}

type SyncPullResponse struct {
	Workflows    []WorkflowData    `json:"workflows,omitempty"`
	Scenarios    []ScenarioData    `json:"scenarios,omitempty"`
	WorkflowRuns []WorkflowRunData `json:"workflow_runs,omitempty"`
	Sessions     []SessionData     `json:"sessions,omitempty"`
	TestResults  []TestResultData  `json:"test_results,omitempty"`
}

// --- Conflict and Error Info ---

type ConflictInfo struct {
	EntityType string `json:"entity_type"`
	EntityID   string `json:"entity_id"`
	Resolution string `json:"resolution"`
	Message    string `json:"message"`
}

type SyncError struct {
	EntityType string `json:"entity_type,omitempty"`
	EntityID   string `json:"entity_id,omitempty"`
	Message    string `json:"message"`
}

// --- Individual Change ---

type SyncChange struct {
	EntityType    string          `json:"entity_type"`
	EntityID      string          `json:"entity_id"`
	ChangeType    string          `json:"change_type"` // insert/update/delete
	Data          json.RawMessage `json:"data"`
	ClientTime    time.Time       `json:"client_time"`
	ClientVersion int             `json:"client_version"`
}

// --- Workflow Data ---

type WorkflowData struct {
	ID          string          `json:"id"`
	UserID      string          `json:"user_id"`
	ProjectID   string          `json:"project_id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	NodesConfig json.RawMessage `json:"nodes_config"`
	EdgesConfig json.RawMessage `json:"edges_config"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	Version     int             `json:"version"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	ClientID    string          `json:"client_id"`
	IsDeleted   bool            `json:"is_deleted"`
}

type ScenarioData struct {
	ID          string          `json:"id"`
	ProjectID   string          `json:"project_id"`
	WorkflowID  string          `json:"workflow_id"`
	UserID      string          `json:"user_id"`
	Name        string          `json:"name"`
	Description string          `json:"description,omitempty"`
	TestsConfig json.RawMessage `json:"tests_config"`
	TestOrder   json.RawMessage `json:"test_order"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	Version     int             `json:"version"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	ClientID    string          `json:"client_id"`
	IsDeleted   bool            `json:"is_deleted"`
}

type WorkflowRunData struct {
	ID          string          `json:"id"`
	ProjectID   string          `json:"project_id"`
	WorkflowID  string          `json:"workflow_id"`
	UserID      string          `json:"user_id"`
	Status      string          `json:"status"`
	Summary     json.RawMessage `json:"summary,omitempty"`
	Logs        json.RawMessage `json:"logs,omitempty"`
	Error       string          `json:"error,omitempty"`
	StartedAt   *time.Time      `json:"started_at,omitempty"`
	CompletedAt *time.Time      `json:"completed_at,omitempty"`
	Metadata    json.RawMessage `json:"metadata,omitempty"`
	Version     int             `json:"version"`
	CreatedAt   time.Time       `json:"created_at"`
	UpdatedAt   time.Time       `json:"updated_at"`
	ClientID    string          `json:"client_id"`
	IsDeleted   bool            `json:"is_deleted"`
}

// --- Session Data ---

type SessionData struct {
	ID               string          `json:"id"`
	UserID           string          `json:"user_id"`
	ProjectID        string          `json:"project_id"`
	WorkflowRunID    string          `json:"workflow_run_id,omitempty"`
	WorkflowID       string          `json:"workflow_id,omitempty"`
	ScenarioID       string          `json:"scenario_id,omitempty"`
	ScenarioName     string          `json:"scenario_name,omitempty"`
	BackendSessionID string          `json:"backend_session_id,omitempty"`
	Status           string          `json:"status"`                  // pending,running,completed,failed
	Result           json.RawMessage `json:"result,omitempty"`        // JSON
	ContainerIDs     json.RawMessage `json:"container_ids,omitempty"` // JSON array
	Logs             json.RawMessage `json:"logs,omitempty"`          // JSON array
	Error            string          `json:"error,omitempty"`
	StartedAt        *time.Time      `json:"started_at,omitempty"`
	CompletedAt      *time.Time      `json:"completed_at,omitempty"`
	OwnerID          string          `json:"owner_id,omitempty"`
	LeaseExpiresAt   *time.Time      `json:"lease_expires_at,omitempty"`
	HeartbeatAt      *time.Time      `json:"heartbeat_at,omitempty"`
	Phase            string          `json:"phase,omitempty"`
	CheckpointIndex  int             `json:"checkpoint_index,omitempty"`
	ServiceGraph     json.RawMessage `json:"service_graph,omitempty"`
	TestPlan         json.RawMessage `json:"test_plan,omitempty"`
	RuntimeSnapshot  json.RawMessage `json:"runtime_snapshot,omitempty"`
	Version          int             `json:"version"`
	CreatedAt        time.Time       `json:"created_at"`
	UpdatedAt        time.Time       `json:"updated_at"`
	ClientID         string          `json:"client_id"`
	IsDeleted        bool            `json:"is_deleted"`
}

// --- Test Result Data ---

type TestResultData struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	ProjectID     string    `json:"project_id"`
	SessionID     string    `json:"session_id"`
	WorkflowRunID string    `json:"workflow_run_id,omitempty"`
	WorkflowID    string    `json:"workflow_id"`
	ScenarioID    string    `json:"scenario_id,omitempty"`
	ScenarioName  string    `json:"scenario_name,omitempty"`
	TestName      string    `json:"test_name"`
	TestType      string    `json:"test_type"` // database/http/shell/cache/kafka
	Status        string    `json:"status"`
	ResultData    string    `json:"result_data,omitempty"` // JSON string
	DurationMs    int       `json:"duration_ms,omitempty"`
	ExecutedAt    time.Time `json:"executed_at"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
	ClientID      string    `json:"client_id"`
	IsDeleted     bool      `json:"is_deleted"`
}
