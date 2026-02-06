package db

import (
	"context"
	"time"
)

type Database interface {
	// Workflows
	UpsertWorkflow(ctx context.Context, workflow *Workflow) error
	GetWorkflow(ctx context.Context, id string) (*Workflow, error)
	DeleteWorkflow(ctx context.Context, id string) error
	ListWorkflows(ctx context.Context, userID string) ([]*Workflow, error)

	// Sessions
	UpsertSession(ctx context.Context, session *Session) error
	GetSession(ctx context.Context, id string) (*Session, error)
	DeleteSession(ctx context.Context, id string) error
	ListSessions(ctx context.Context, workflowID string) ([]*Session, error)
	ListSessionsByUserId(ctx context.Context, userID string) ([]*Session, error)

	// Test results
	UpsertTestResult(ctx context.Context, result *TestResult) error
	GetTestResult(ctx context.Context, id string) (*TestResult, error)
	DeleteTestResult(ctx context.Context, id string) error
	ListTestResults(ctx context.Context, sessionID string) ([]*TestResult, error)
	ListTestResultsByUserId(ctx context.Context, userID string) ([]*TestResult, error)

	// Sync metadata (per user + per client)
	UpsertSyncMetaData(ctx context.Context, metadata *SyncMetadata) error
	GetSyncMetaData(ctx context.Context, userID string, clientID string) (*SyncMetadata, error)

	// Lifecycle
	Close() error
	Ping(ctx context.Context) error
}

type Workflow struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description,omitempty"`
	NodesConfig string    `json:"nodes_config"`
	EdgesConfig string    `json:"edges_config"`
	Metadata    string    `json:"metadata,omitempty"`
	Version     int       `json:"version"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	ClientID    string    `json:"client_id"`
	UserID      string    `json:"user_id"`
	IsDeleted   bool      `json:"is_deleted"`
}

type Session struct {
	ID           string     `json:"id"`
	WorkflowID   string     `json:"workflow_id,omitempty"`
	Status       string     `json:"status"`                  //pending,running,completed,failed
	Result       string     `json:"result,omitempty"`        //JSON stringified
	ContainerIDs string     `json:"container_ids,omitempty"` //JSON string array
	Logs         string     `json:"logs,omitempty"`          //JSON string array
	Error        string     `json:"error,omitempty"`
	StartedAt    *time.Time `json:"started_at,omitempty"`
	CompletedAt  *time.Time `json:"completed_at,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
	ClientID     string     `json:"client_id"`
	UserID       string     `json:"user_id"`
	IsDeleted    bool       `json:"is_deleted"`
}

type TestResult struct {
	ID         string    `json:"id"`
	SessionID  string    `json:"session_id"`
	WorkflowID string    `json:"workflow_id"`
	TestName   string    `json:"test_name"`
	TestType   string    `json:"test_type"` //database/http/shell/cache/kafka
	Status     string    `json:"status"`
	ResultData string    `json:"result_data,omitempty"` //stringified json
	DurationMs int       `json:"duration_ms,omitempty"`
	ExecutedAt time.Time `json:"executed_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	ClientID   string    `json:"client_id"`
	UserID     string    `json:"user_id"`
	IsDeleted  bool      `json:"is_deleted"`
}

type SyncMetadata struct {
	ClientID        string    `json:"client_id"`
	UserID          string    `json:"user_id"`
	LastSyncAt      time.Time `json:"last_sync_at"`
	LastSyncVersion int       `json:"last_sync_version"`
	SyncStatus      string    `json:"sync_status"` // idle/syncing/error
}
