package dto

import (
	"encoding/json"
	"time"

	"github.com/dev-atharva/cots/pkg/types"
)

type SyncBatchRequestDTO struct {
	ClientID  string          `json:"client_id" validate:"required,min=1"`
	UserID    string          `json:"user_id" validate:"required,min=1"`
	TimeStamp time.Time       `json:"timestamp" validate:"required"`
	Changes   []SyncChangeDTO `json:"changes" validate:"required,min=1,dive"`
}

type SyncChangeDTO struct {
	EntityType    string          `json:"entity_type" validate:"required,oneof=workflow session test_result"`
	EntityID      string          `json:"entity_id" validate:"required,min=1"`
	ChangeType    string          `json:"change_type" validate:"required,oneof=insert update delete"`
	Data          json.RawMessage `json:"data" validate:"required_unless=ChangeType delete"`
	ClientTime    time.Time       `json:"client_time" validate:"required"`
	ClientVersion int             `json:"client_version" validate:"gte=0"`
}

func (dto *SyncBatchRequestDTO) ToSyncBatchRequest() *types.SyncBatchRequest {
	changes := make([]types.SyncChange, len(dto.Changes))
	for i, change := range dto.Changes {
		changes[i] = types.SyncChange{
			EntityType:    change.EntityType,
			EntityID:      change.EntityID,
			ChangeType:    change.ChangeType,
			Data:          change.Data,
			ClientTime:    change.ClientTime,
			ClientVersion: change.ClientVersion,
		}
	}
	return &types.SyncBatchRequest{
		ClientID:  dto.ClientID,
		UserID:    dto.UserID,
		TimeStamp: dto.TimeStamp,
		Changes:   changes,
	}
}

type SyncBatchResponse struct {
	Success        bool           `json:"success"`
	ProcessedCount int            `json:"processed_count"`
	Conflicts      []ConflictInfo `json:"conflicts,omitempty"`
	Errors         []SyncError    `json:"errors,omitempty"`
	ServerVersion  int            `json:"server_version"`
}

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

func FromTypesSyncBatchResponse(resp *types.SyncBatchResponse) *SyncBatchResponse {
	conflicts := make([]ConflictInfo, len(resp.Conflicts))
	for i, c := range resp.Conflicts {
		conflicts[i] = ConflictInfo{
			EntityType: c.EntityType,
			EntityID:   c.EntityID,
			Resolution: c.Resolution,
			Message:    c.Message,
		}
	}

	errors := make([]SyncError, len(resp.Errors))
	for i, e := range resp.Errors {
		errors[i] = SyncError{
			EntityType: e.EntityType,
			EntityID:   e.EntityID,
			Message:    e.Message,
		}
	}

	return &SyncBatchResponse{
		Success:        resp.Success,
		ProcessedCount: resp.ProcessedCount,
		Conflicts:      conflicts,
		Errors:         errors,
		ServerVersion:  resp.ServerVersion,
	}
}

type SyncStatusResponse struct {
	Status        string    `json:"status"`
	ServerVersion int       `json:"server_version"`
	TimeStamp     time.Time `json:"timestamp"`
}

func FromTypesSyncStatusResponse(resp *types.SyncStatusResponse) *SyncStatusResponse {
	return &SyncStatusResponse{
		Status:        resp.Status,
		ServerVersion: resp.ServerVersion,
		TimeStamp:     resp.TimeStamp,
	}
}

type SyncPullResponse struct {
	Workflows   []WorkflowData   `json:"workflows,omitempty"`
	Sessions    []SessionData    `json:"sessions,omitempty"`
	TestResults []TestResultData `json:"test_results,omitempty"`
}

type WorkflowData struct {
	ID          string          `json:"id"`
	UserID      string          `json:"user_id"`
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

type SessionData struct {
	ID           string          `json:"id"`
	UserID       string          `json:"user_id"`
	WorkflowID   string          `json:"workflow_id,omitempty"`
	Status       string          `json:"status"`
	Result       json.RawMessage `json:"result,omitempty"`
	ContainerIDs json.RawMessage `json:"container_ids,omitempty"`
	Logs         json.RawMessage `json:"logs,omitempty"`
	Error        string          `json:"error,omitempty"`
	StartedAt    *time.Time      `json:"started_at,omitempty"`
	CompletedAt  *time.Time      `json:"completed_at,omitempty"`
	Version      int             `json:"version"`
	CreatedAt    time.Time       `json:"created_at"`
	UpdatedAt    time.Time       `json:"update_at"`
	ClientID     string          `json:"client_id"`
	IsDeleted    bool            `json:"is_deleted"`
}

type TestResultData struct {
	ID         string    `json:"id"`
	UserID     string    `json:"user_id"`
	SessionID  string    `json:"session_id"`
	WorkflowID string    `json:"workflow_id"`
	TestName   string    `json:"test_name"`
	TestType   string    `json:"test_type"`
	Status     string    `json:"status"`
	ResultData string    `json:"result_data,omitempty"`
	DurationMs int       `json:"duration_ms,omitempty"`
	ExecutedAt time.Time `json:"executed_at"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
	ClientID   string    `json:"client_id"`
	IsDeleted  bool      `json:"is_deleted"`
}

func FromTypesSyncPullResponse(resp *types.SyncPullResponse) *SyncPullResponse {
	workflows := make([]WorkflowData, len(resp.Workflows))
	for i, wf := range resp.Workflows {
		workflows[i] = WorkflowData{
			ID:          wf.ID,
			UserID:      wf.UserID,
			Name:        wf.Name,
			Description: wf.Description,
			NodesConfig: wf.NodesConfig,
			EdgesConfig: wf.EdgesConfig,
			Metadata:    wf.Metadata,
			Version:     wf.Version,
			CreatedAt:   wf.CreatedAt,
			UpdatedAt:   wf.UpdatedAt,
			ClientID:    wf.ClientID,
			IsDeleted:   wf.IsDeleted,
		}
	}

	session := make([]SessionData, len(resp.Sessions))
	for i, sess := range resp.Sessions {
		session[i] = SessionData{
			ID:           sess.ID,
			UserID:       sess.UserID,
			WorkflowID:   sess.WorkflowID,
			Status:       sess.Status,
			Result:       sess.Result,
			ContainerIDs: sess.ContainerIDs,
			Logs:         sess.Logs,
			Error:        sess.Error,
			StartedAt:    sess.StartedAt,
			CompletedAt:  sess.CompletedAt,
			Version:      sess.Version,
			CreatedAt:    sess.CreatedAt,
			UpdatedAt:    sess.UpdatedAt,
			ClientID:     sess.ClientID,
			IsDeleted:    sess.IsDeleted,
		}
	}

	testResults := make([]TestResultData, len(resp.TestResults))
	for i, tr := range resp.TestResults {
		testResults[i] = TestResultData{
			ID:         tr.ID,
			UserID:     tr.UserID,
			SessionID:  tr.SessionID,
			WorkflowID: tr.WorkflowID,
			TestName:   tr.TestName,
			TestType:   tr.TestType,
			Status:     tr.Status,
			ResultData: tr.ResultData,
			DurationMs: tr.DurationMs,
			ExecutedAt: tr.ExecutedAt,
			CreatedAt:  tr.CreatedAt,
			UpdatedAt:  tr.UpdatedAt,
			ClientID:   tr.ClientID,
			IsDeleted:  tr.IsDeleted,
		}
	}

	return &SyncPullResponse{
		Workflows:   workflows,
		Sessions:    session,
		TestResults: testResults,
	}
}

type SyncClearResponse struct {
	Message  string `json:"message"`
	ClientID string `json:"client_id"`
	UserID   string `json:"user_id"`
}
