package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/types"
)

type Service struct {
	db db.Database
}

func NewService(database db.Database) *Service {
	return &Service{
		db: database,
	}
}

// ProcessBatch handles a batch of sync changes from the client
func (s *Service) ProcessBatch(ctx context.Context, req *types.SyncBatchRequest) (*types.SyncBatchResponse, error) {
	response := &types.SyncBatchResponse{
		Success:        true,
		ProcessedCount: 0,
		Conflicts:      []types.ConflictInfo{},
		Errors:         []types.SyncError{},
		ServerVersion:  0,
	}

	// Fetch or initialize sync metadata
	syncMeta, err := s.db.GetSyncMetaData(ctx, req.UserID, req.ClientID)
	if err != nil {
		syncMeta = &db.SyncMetadata{
			ClientID:        req.ClientID,
			UserID:          req.UserID,
			LastSyncAt:      time.Now(),
			LastSyncVersion: 0,
			SyncStatus:      "syncing",
		}
	} else {
		syncMeta.SyncStatus = "syncing"
		syncMeta.LastSyncAt = time.Now()
	}

	// Process each change
	for _, change := range req.Changes {
		if err := s.processChange(ctx, &change, response, req.UserID); err != nil {
			log.Printf("Error processing change for %s:%s: %v", change.EntityType, change.EntityID, err)
			response.Errors = append(response.Errors, types.SyncError{
				EntityType: change.EntityType,
				EntityID:   change.EntityID,
				Message:    err.Error(),
			})
			continue
		}
		response.ProcessedCount++
	}

	// Update sync metadata
	syncMeta.LastSyncVersion++
	syncMeta.SyncStatus = "idle"
	response.ServerVersion = syncMeta.LastSyncVersion

	if err := s.db.UpsertSyncMetaData(ctx, syncMeta); err != nil {
		log.Printf("Failed to update sync metadata: %v", err)
		response.Errors = append(response.Errors, types.SyncError{
			Message: fmt.Sprintf("Failed to update sync metadata: %v", err),
		})
	}

	if len(response.Errors) > 0 {
		response.Success = false
	}

	return response, nil
}

// processChange dispatches the change to the correct handler
func (s Service) processChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.EntityType {
	case "workflow":
		return s.processWorkflowChange(ctx, change, response, userID)
	case "session":
		return s.processSessionChange(ctx, change, response, userID)
	case "test_result":
		return s.processTestResultChange(ctx, change, response, userID)
	default:
		return fmt.Errorf("unknown entity type: %s", change.EntityType)
	}
}

// --- Workflow Changes ---
func (s *Service) processWorkflowChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var workflowData types.WorkflowData
		if err := json.Unmarshal(change.Data, &workflowData); err != nil {
			return fmt.Errorf("failed to unmarshal workflow data: %w", err)
		}

		existing, err := s.db.GetWorkflow(ctx, workflowData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "workflow",
				EntityID:   workflowData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated at: %s) is newer than client (updated at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		wf := &db.Workflow{
			ID:          workflowData.ID,
			Name:        workflowData.Name,
			Description: workflowData.Description,
			NodesConfig: string(workflowData.NodesConfig),
			EdgesConfig: string(workflowData.EdgesConfig),
			Metadata:    string(workflowData.Metadata),
			Version:     workflowData.Version,
			CreatedAt:   workflowData.CreatedAt,
			UpdatedAt:   workflowData.UpdatedAt,
			ClientID:    workflowData.ClientID,
			UserID:      userID,
			IsDeleted:   workflowData.IsDeleted,
		}

		return s.db.UpsertWorkflow(ctx, wf)
	case "delete":
		return s.db.DeleteWorkflow(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown workflow change type: %s", change.ChangeType)
	}
}

// --- Session Changes ---
func (s *Service) processSessionChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var sessionData types.SessionData
		if err := json.Unmarshal(change.Data, &sessionData); err != nil {
			return fmt.Errorf("failed to unmarshal session data: %w", err)
		}

		existing, err := s.db.GetSession(ctx, sessionData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "session",
				EntityID:   sessionData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated_at: %s) is newer than client (updated_at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		sess := &db.Session{
			ID:           sessionData.ID,
			WorkflowID:   sessionData.WorkflowID,
			Status:       sessionData.Status,
			Result:       string(sessionData.Result),
			ContainerIDs: string(sessionData.ContainerIDs),
			Logs:         string(sessionData.Logs),
			Error:        sessionData.Error,
			StartedAt:    sessionData.StartedAt,
			CompletedAt:  sessionData.CompletedAt,
			CreatedAt:    sessionData.CreatedAt,
			UpdatedAt:    sessionData.UpdatedAt,
			ClientID:     sessionData.ClientID,
			UserID:       userID,
			IsDeleted:    sessionData.IsDeleted,
		}

		return s.db.UpsertSession(ctx, sess)
	case "delete":
		return s.db.DeleteSession(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown session change type: %s", change.ChangeType)
	}
}

// --- TestResult Changes ---
// --- TestResult Changes ---
func (s *Service) processTestResultChange(
	ctx context.Context,
	change *types.SyncChange,
	response *types.SyncBatchResponse,
	userID string,
) error {
	// Handle delete consistently with other entities
	if change.ChangeType == "delete" {
		return s.db.DeleteTestResult(ctx, change.EntityID)
	}

	// Handle insert & update
	if change.ChangeType != "insert" && change.ChangeType != "update" {
		return fmt.Errorf(
			"unsupported test_result change type: %s",
			change.ChangeType,
		)
	}

	var testData types.TestResultData
	if err := json.Unmarshal(change.Data, &testData); err != nil {
		return fmt.Errorf("failed to unmarshal test result data: %w", err)
	}

	// Check if this is an update to an existing test result
	existing, err := s.db.GetTestResult(ctx, testData.ID)

	if err == nil && existing != nil {
		// Test result exists - always accept updates from client
		// This is important for test re-runs with the same test IDs
		log.Printf("Test result %s: updating existing result (old status: %s, new status: %s)",
			testData.ID, existing.Status, testData.Status)
	} else {
		// New test result
		log.Printf("Test result %s: new test result for session %s (status: %s)",
			testData.ID, testData.SessionID, testData.Status)
	}

	result := &db.TestResult{
		ID:         testData.ID,
		SessionID:  testData.SessionID,
		WorkflowID: testData.WorkflowID,
		TestName:   testData.TestName,
		TestType:   testData.TestType,
		Status:     testData.Status,
		ResultData: testData.ResultData,
		DurationMs: testData.DurationMs,
		ExecutedAt: testData.ExecutedAt,
		CreatedAt:  testData.CreatedAt,
		UpdatedAt:  testData.UpdatedAt,
		ClientID:   testData.ClientID,
		UserID:     userID,
		IsDeleted:  testData.IsDeleted,
	}

	// Upsert the test result - always accept the client's version
	if err := s.db.UpsertTestResult(ctx, result); err != nil {
		return fmt.Errorf("failed to upsert test result: %w", err)
	}

	log.Printf("Test result %s saved successfully", testData.ID)

	// Check if all tests for this session are complete
	testResults, err := s.db.ListTestResults(ctx, testData.SessionID)
	if err != nil {
		log.Printf("Warning: failed to list test results for session %s: %v", testData.SessionID, err)
		return nil
	}

	log.Printf("Session %s has %d test results", testData.SessionID, len(testResults))

	// Count completed tests (passed or failed)
	allCompleted := true
	totalTests := 0
	passedTests := 0
	failedTests := 0

	for _, tr := range testResults {
		if tr.IsDeleted {
			continue
		}
		totalTests++

		log.Printf("  - Test %s: status=%s, name=%s", tr.ID, tr.Status, tr.TestName)

		switch tr.Status {
		case "passed":
			passedTests++
		case "failed":
			failedTests++
		default:
			allCompleted = false
		}
	}

	log.Printf("Session %s test summary: total=%d, passed=%d, failed=%d, allCompleted=%v",
		testData.SessionID, totalTests, passedTests, failedTests, allCompleted)

	// Only update session if all tests are complete
	if allCompleted && totalTests > 0 {
		session, err := s.db.GetSession(ctx, testData.SessionID)
		if err != nil {
			log.Printf("Warning: failed to get session %s: %v", testData.SessionID, err)
			return nil
		}

		// Only update if session is not already finalized
		if session != nil && session.Status != "completed" && session.Status != "failed" {
			finalStatus := "completed"
			if failedTests > 0 {
				finalStatus = "failed"
			}

			session.Status = finalStatus
			now := time.Now()
			session.CompletedAt = &now
			session.UpdatedAt = now

			// Update the result with test summary
			summary := map[string]any{
				"total":  totalTests,
				"passed": passedTests,
				"failed": failedTests,
			}
			summaryJSON, _ := json.Marshal(summary)
			session.Result = string(summaryJSON)

			if err := s.db.UpsertSession(ctx, session); err != nil {
				log.Printf("Warning: failed to update session status: %v", err)
				// Don't fail the sync for this
			} else {
				log.Printf(
					"Session %s marked as %s (%d/%d tests passed)",
					testData.SessionID,
					finalStatus,
					passedTests,
					totalTests,
				)
			}
		} else if session != nil {
			log.Printf("Session %s already finalized with status %s, skipping update", session.ID, session.Status)
		}
	}

	return nil
}

// --- Health check ---
func (s *Service) GetStatus(ctx context.Context) (*types.SyncStatusResponse, error) {
	if err := s.db.Ping(ctx); err != nil {
		return &types.SyncStatusResponse{
			Status:        "down",
			ServerVersion: 0,
			TimeStamp:     time.Now(),
		}, nil
	}

	return &types.SyncStatusResponse{
		Status:        "healthy",
		ServerVersion: 1, // or can fetch last sync version globally
		TimeStamp:     time.Now(),
	}, nil
}

// --- Pull changes for a user ---
func (s *Service) PullChanges(ctx context.Context, userID string) (*types.SyncPullResponse, error) {
	response := &types.SyncPullResponse{
		Workflows:   []types.WorkflowData{},
		Sessions:    []types.SessionData{},
		TestResults: []types.TestResultData{},
	}

	workflows, err := s.db.ListWorkflows(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list workflows: %w", err)
	}

	sessions, err := s.db.ListSessionsByUserId(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}

	testResults, err := s.db.ListTestResultsByUserId(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list the test results: %w", err)
	}

	for _, wf := range workflows {
		response.Workflows = append(response.Workflows, types.WorkflowData{
			ID:          wf.ID,
			Name:        wf.Name,
			Description: wf.Description,
			NodesConfig: json.RawMessage(wf.NodesConfig),
			EdgesConfig: json.RawMessage(wf.EdgesConfig),
			Metadata:    json.RawMessage(wf.Metadata),
			Version:     wf.Version,
			CreatedAt:   wf.CreatedAt,
			UpdatedAt:   wf.UpdatedAt,
			ClientID:    wf.ClientID,
			IsDeleted:   wf.IsDeleted,
		})
	}

	for _, sess := range sessions {
		response.Sessions = append(response.Sessions, types.SessionData{
			ID:           sess.ID,
			UserID:       sess.UserID,
			WorkflowID:   sess.WorkflowID,
			Status:       sess.Status,
			Result:       json.RawMessage(sess.Result),
			ContainerIDs: json.RawMessage(sess.ContainerIDs),
			Logs:         json.RawMessage(sess.Logs),
			Error:        sess.Error,
			StartedAt:    sess.StartedAt,
			CompletedAt:  sess.CompletedAt,
			CreatedAt:    sess.CreatedAt,
			UpdatedAt:    sess.UpdatedAt,
			ClientID:     sess.ClientID,
			IsDeleted:    sess.IsDeleted,
		})
	}

	for _, testres := range testResults {
		response.TestResults = append(response.TestResults, types.TestResultData{
			ID:         testres.ID,
			SessionID:  testres.SessionID,
			WorkflowID: testres.WorkflowID,
			TestName:   testres.TestName,
			TestType:   testres.TestType,
			Status:     testres.Status,
			ResultData: testres.ResultData,
			DurationMs: testres.DurationMs,
			ExecutedAt: testres.ExecutedAt,
			CreatedAt:  testres.CreatedAt,
			UpdatedAt:  testres.UpdatedAt,
			ClientID:   testres.ClientID,
			IsDeleted:  testres.IsDeleted,
		})
	}

	return response, nil
}
