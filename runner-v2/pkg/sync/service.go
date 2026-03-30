package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"github.com/dev-atharva/cots/pkg/types"
	"go.opentelemetry.io/otel/attribute"
)

type Service struct {
	db db.Database
}

func NewService(database db.Database) *Service {
	return &Service{
		db: database,
	}
}

// ProcessBatch handles a batch of sync changes from the client within a transaction
func (s *Service) ProcessBatch(ctx context.Context, req *types.SyncBatchRequest) (*types.SyncBatchResponse, error) {
	ctx, span := telemetry.StartSpan(ctx, "sync.process_batch", attribute.Int("changes_count", len(req.Changes)))
	defer span.End()

	logger.InfoContext(ctx, "processing sync batch", "client_id", req.ClientID, "user_id", req.UserID, "changes_count", len(req.Changes))

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
		logger.DebugContext(ctx, "initializing new sync metadata", "user_id", req.UserID, "client_id", req.ClientID)
		syncMeta = &db.SyncMetadata{
			ClientID:        req.ClientID,
			UserID:          req.UserID,
			LastSyncAt:      time.Now(),
			LastSyncVersion: 0,
			SyncStatus:      "syncing",
		}
	} else {
		logger.DebugContext(ctx, "updating new sync metadata", "user_id", req.UserID, "client_id", req.ClientID)
		syncMeta.SyncStatus = "syncing"
		syncMeta.LastSyncAt = time.Now()
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		logger.ErrorContext(ctx, "failed to begin transaction", "error", err)
		telemetry.RecordError(ctx, err)
		return nil, fmt.Errorf("failed to begin transaction : %w", err)
	}
	defer tx.Rollback()

	// Process each change within transaction
	for _, change := range req.Changes {
		changeCtx := logger.WithFields(
			ctx,
			"entity_type", change.EntityType,
			"entity_id", change.EntityID,
			"change_type", change.ChangeType,
		)
		logger.DebugContext(changeCtx, "processing sync change")

		if err := s.processChangeInTx(changeCtx, tx, &change, response, req.UserID); err != nil {
			logger.WarnContext(changeCtx, "error processing change", "error", err)
			response.Errors = append(response.Errors, types.SyncError{
				EntityType: change.EntityType,
				EntityID:   change.EntityID,
				Message:    err.Error(),
			})
			continue
		}

		logger.DebugContext(changeCtx, "sync change processed successfully")
		response.ProcessedCount++
	}

	// Update sync metadata within transaction
	syncMeta.LastSyncVersion++
	syncMeta.SyncStatus = "idle"
	response.ServerVersion = syncMeta.LastSyncVersion

	if err := tx.UpsertSyncMetaData(ctx, syncMeta); err != nil {
		logger.WarnContext(ctx, "failed to update sync metadata", "error", err)
		response.Errors = append(response.Errors, types.SyncError{
			Message: fmt.Sprintf("Failed to update sync metadata: %v", err),
		})
		response.Success = false
		telemetry.RecordError(ctx, err)
		return response, nil
	}

	//Rollback if errors
	if len(response.Errors) > 0 {
		logger.WarnContext(ctx, "sync batch completed with errors", "error_count", len(response.Errors))
		response.Success = false
		return response, nil
	}

	if err := tx.Commit(); err != nil {
		logger.ErrorContext(ctx, "failed to commit transaction", "error", err)
		response.Success = false
		response.Errors = append(response.Errors, types.SyncError{
			Message: fmt.Sprintf("Failed to commit transaction: %v", err),
		})
		telemetry.RecordError(ctx, err)
		return response, nil
	}

	logger.InfoContext(ctx, "sync batch processed successfully", "processed_count", response.ProcessedCount, "conflicts", len(response.Conflicts), "server_version", response.ServerVersion)
	return response, nil
}

// processChange dispatches the change to the correct handler
// (legacy kept for compatiblity)
func (s Service) processChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.EntityType {
	case "workflow":
		return s.processWorkflowChange(ctx, change, response, userID)
	case "scenario":
		return s.processScenarioChange(ctx, change, response, userID)
	case "workflow_run":
		return s.processWorkflowRunChange(ctx, change, response, userID)
	case "scenario_run", "session":
		return s.processSessionChange(ctx, change, response, userID)
	case "test_result":
		return s.processTestResultChange(ctx, change, response, userID)
	default:
		return fmt.Errorf("unknown entity type: %s", change.EntityType)
	}
}

func (s Service) processChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.EntityType {
	case "workflow":
		return s.processWorkflowChangeInTx(ctx, tx, change, response, userID)
	case "scenario":
		return s.processScenarioChangeInTx(ctx, tx, change, response, userID)
	case "workflow_run":
		return s.processWorkflowRunChangeInTx(ctx, tx, change, response, userID)
	case "scenario_run", "session":
		return s.processSessionChangeInTx(ctx, tx, change, response, userID)
	case "test_result":
		return s.processTestResultChangeInTx(ctx, tx, change, response, userID)
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

func (s *Service) processWorkflowChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var workflowData types.WorkflowData
		if err := json.Unmarshal(change.Data, &workflowData); err != nil {
			return fmt.Errorf("failed to unmarshal workflow data: %w", err)
		}

		existing, err := tx.GetWorkflow(ctx, workflowData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "workflow",
				EntityID:   workflowData.ID,
				Resolution: "server_wins",
				Message:    fmt.Sprintf("Server version (updated at: %s) is newer than client (update at : %s)", existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
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
			UserID:      workflowData.UserID,
			IsDeleted:   workflowData.IsDeleted,
		}
		return tx.UpsertWorkflow(ctx, wf)
	case "delete":
		return tx.DeleteWorkflow(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown workflow change type: %s", change.ChangeType)
	}
}

// --- Scenario Changes ---
func (s *Service) processScenarioChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var scenarioData types.ScenarioData
		if err := json.Unmarshal(change.Data, &scenarioData); err != nil {
			return fmt.Errorf("failed to unmarshal scenario data: %w", err)
		}

		existing, err := s.db.GetScenario(ctx, scenarioData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "scenario",
				EntityID:   scenarioData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated at: %s) is newer than client (updated at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		scenario := &db.Scenario{
			ID:          scenarioData.ID,
			WorkflowID:  scenarioData.WorkflowID,
			Name:        scenarioData.Name,
			Description: scenarioData.Description,
			TestsConfig: string(scenarioData.TestsConfig),
			TestOrder:   string(scenarioData.TestOrder),
			Metadata:    string(scenarioData.Metadata),
			Version:     scenarioData.Version,
			CreatedAt:   scenarioData.CreatedAt,
			UpdatedAt:   scenarioData.UpdatedAt,
			ClientID:    scenarioData.ClientID,
			UserID:      userID,
			IsDeleted:   scenarioData.IsDeleted,
		}

		return s.db.UpsertScenario(ctx, scenario)
	case "delete":
		return s.db.DeleteScenario(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown scenario change type: %s", change.ChangeType)
	}
}

func (s *Service) processScenarioChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var scenarioData types.ScenarioData
		if err := json.Unmarshal(change.Data, &scenarioData); err != nil {
			return fmt.Errorf("failed to unmarshal scenario data: %w", err)
		}

		existing, err := tx.GetScenario(ctx, scenarioData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "scenario",
				EntityID:   scenarioData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated at: %s) is newer than client (updated at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		scenario := &db.Scenario{
			ID:          scenarioData.ID,
			WorkflowID:  scenarioData.WorkflowID,
			Name:        scenarioData.Name,
			Description: scenarioData.Description,
			TestsConfig: string(scenarioData.TestsConfig),
			TestOrder:   string(scenarioData.TestOrder),
			Metadata:    string(scenarioData.Metadata),
			Version:     scenarioData.Version,
			CreatedAt:   scenarioData.CreatedAt,
			UpdatedAt:   scenarioData.UpdatedAt,
			ClientID:    scenarioData.ClientID,
			UserID:      userID,
			IsDeleted:   scenarioData.IsDeleted,
		}

		return tx.UpsertScenario(ctx, scenario)
	case "delete":
		return tx.DeleteScenario(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown scenario change type: %s", change.ChangeType)
	}
}

// --- Workflow Run Changes ---
func (s *Service) processWorkflowRunChange(ctx context.Context, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var workflowRunData types.WorkflowRunData
		if err := json.Unmarshal(change.Data, &workflowRunData); err != nil {
			return fmt.Errorf("failed to unmarshal workflow run data: %w", err)
		}

		existing, err := s.db.GetWorkflowRun(ctx, workflowRunData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "workflow_run",
				EntityID:   workflowRunData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated at: %s) is newer than client (updated at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		workflowRun := &db.WorkflowRun{
			ID:          workflowRunData.ID,
			WorkflowID:  workflowRunData.WorkflowID,
			Status:      workflowRunData.Status,
			Summary:     string(workflowRunData.Summary),
			Logs:        string(workflowRunData.Logs),
			Error:       workflowRunData.Error,
			StartedAt:   workflowRunData.StartedAt,
			CompletedAt: workflowRunData.CompletedAt,
			Metadata:    string(workflowRunData.Metadata),
			Version:     workflowRunData.Version,
			CreatedAt:   workflowRunData.CreatedAt,
			UpdatedAt:   workflowRunData.UpdatedAt,
			ClientID:    workflowRunData.ClientID,
			UserID:      userID,
			IsDeleted:   workflowRunData.IsDeleted,
		}

		return s.db.UpsertWorkflowRun(ctx, workflowRun)
	case "delete":
		return s.db.DeleteWorkflowRun(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown workflow run change type: %s", change.ChangeType)
	}
}

func (s *Service) processWorkflowRunChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var workflowRunData types.WorkflowRunData
		if err := json.Unmarshal(change.Data, &workflowRunData); err != nil {
			return fmt.Errorf("failed to unmarshal workflow run data: %w", err)
		}

		existing, err := tx.GetWorkflowRun(ctx, workflowRunData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "workflow_run",
				EntityID:   workflowRunData.ID,
				Resolution: "server_wins",
				Message: fmt.Sprintf("Server version (updated at: %s) is newer than client (updated at: %s)",
					existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		workflowRun := &db.WorkflowRun{
			ID:          workflowRunData.ID,
			WorkflowID:  workflowRunData.WorkflowID,
			Status:      workflowRunData.Status,
			Summary:     string(workflowRunData.Summary),
			Logs:        string(workflowRunData.Logs),
			Error:       workflowRunData.Error,
			StartedAt:   workflowRunData.StartedAt,
			CompletedAt: workflowRunData.CompletedAt,
			Metadata:    string(workflowRunData.Metadata),
			Version:     workflowRunData.Version,
			CreatedAt:   workflowRunData.CreatedAt,
			UpdatedAt:   workflowRunData.UpdatedAt,
			ClientID:    workflowRunData.ClientID,
			UserID:      userID,
			IsDeleted:   workflowRunData.IsDeleted,
		}

		return tx.UpsertWorkflowRun(ctx, workflowRun)
	case "delete":
		return tx.DeleteWorkflowRun(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown workflow run change type: %s", change.ChangeType)
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
			ID:               sessionData.ID,
			WorkflowRunID:    sessionData.WorkflowRunID,
			WorkflowID:       sessionData.WorkflowID,
			ScenarioID:       sessionData.ScenarioID,
			ScenarioName:     sessionData.ScenarioName,
			BackendSessionID: sessionData.BackendSessionID,
			Status:           sessionData.Status,
			Result:           string(sessionData.Result),
			ContainerIDs:     string(sessionData.ContainerIDs),
			Logs:             string(sessionData.Logs),
			Error:            sessionData.Error,
			StartedAt:        sessionData.StartedAt,
			CompletedAt:      sessionData.CompletedAt,
			Version:          sessionData.Version,
			CreatedAt:        sessionData.CreatedAt,
			UpdatedAt:        sessionData.UpdatedAt,
			ClientID:         sessionData.ClientID,
			UserID:           userID,
			IsDeleted:        sessionData.IsDeleted,
		}

		return s.db.UpsertSession(ctx, sess)
	case "delete":
		return s.db.DeleteSession(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown session change type: %s", change.ChangeType)
	}
}

func (s *Service) processSessionChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, response *types.SyncBatchResponse, userID string) error {
	switch change.ChangeType {
	case "insert", "update":
		var sessionData types.SessionData
		if err := json.Unmarshal(change.Data, &sessionData); err != nil {
			return fmt.Errorf("failed to unmarshal session data: %w", err)
		}
		existing, err := tx.GetSession(ctx, sessionData.ID)
		if err == nil && existing.UpdatedAt.After(change.ClientTime) {
			response.Conflicts = append(response.Conflicts, types.ConflictInfo{
				EntityType: "session",
				EntityID:   sessionData.ID,
				Resolution: "server_wins",
				Message:    fmt.Sprintf("Server version (updated_at: %s) is newer than client (updated_at: %s)", existing.UpdatedAt.Format(time.RFC3339), change.ClientTime.Format(time.RFC3339)),
			})
			return nil
		}

		sess := &db.Session{
			ID:               sessionData.ID,
			WorkflowRunID:    sessionData.WorkflowRunID,
			WorkflowID:       sessionData.WorkflowID,
			ScenarioID:       sessionData.ScenarioID,
			ScenarioName:     sessionData.ScenarioName,
			BackendSessionID: sessionData.BackendSessionID,
			Status:           sessionData.Status,
			Result:           string(sessionData.Result),
			ContainerIDs:     string(sessionData.ContainerIDs),
			Logs:             string(sessionData.Logs),
			Error:            sessionData.Error,
			StartedAt:        sessionData.StartedAt,
			CompletedAt:      sessionData.CompletedAt,
			Version:          sessionData.Version,
			CreatedAt:        sessionData.CreatedAt,
			UpdatedAt:        sessionData.UpdatedAt,
			ClientID:         sessionData.ClientID,
			UserID:           userID,
			IsDeleted:        sessionData.IsDeleted,
		}
		return tx.UpsertSession(ctx, sess)
	case "delete":
		return tx.DeleteSession(ctx, change.EntityID)
	default:
		return fmt.Errorf("unknown sessin change type: %s", change.ChangeType)
	}
}

// --- TestResult Changes ---
func (s *Service) processTestResultChange(
	ctx context.Context,
	change *types.SyncChange,
	_ *types.SyncBatchResponse,
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
		logger.DebugContext(ctx, "test result : updating existing result", "test_id", testData.ID, "old_status", existing.Status, "new_status", testData.Status)
	} else {
		// New test result
		logger.DebugContext(ctx, "test result : new test result for session", "test_id", testData.ID, "session_id", testData.SessionID, "status", testData.Status)
	}

	result := &db.TestResult{
		ID:            testData.ID,
		SessionID:     testData.SessionID,
		WorkflowRunID: testData.WorkflowRunID,
		WorkflowID:    testData.WorkflowID,
		ScenarioID:    testData.ScenarioID,
		ScenarioName:  testData.ScenarioName,
		TestName:      testData.TestName,
		TestType:      testData.TestType,
		Status:        testData.Status,
		ResultData:    testData.ResultData,
		DurationMs:    testData.DurationMs,
		ExecutedAt:    testData.ExecutedAt,
		CreatedAt:     testData.CreatedAt,
		UpdatedAt:     testData.UpdatedAt,
		ClientID:      testData.ClientID,
		UserID:        userID,
		IsDeleted:     testData.IsDeleted,
	}

	// Upsert the test result - always accept the client's version
	if err := s.db.UpsertTestResult(ctx, result); err != nil {
		return fmt.Errorf("failed to upsert test result: %w", err)
	}

	logger.DebugContext(ctx, "test result saved successfully", "test_id", testData.ID)

	// Check if all tests for this session are complete
	testResults, err := s.db.ListTestResults(ctx, testData.SessionID)
	if err != nil {
		logger.WarnContext(ctx, "failed to list test results for session", "session_id", testData.SessionID, "error", err)
		return nil
	}

	logger.DebugContext(ctx, "session test results count", "session_id", testData.SessionID, "test_results_count", len(testResults))

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

		logger.DebugContext(ctx, "test result detail", "test_id", tr.ID, "status", tr.Status, "test_name", tr.TestName)

		switch tr.Status {
		case "passed":
			passedTests++
		case "failed":
			failedTests++
		default:
			allCompleted = false
		}
	}

	logger.InfoContext(ctx, "session test summary", "session_id", testData.SessionID, "total", totalTests, "passed", passedTests, "failed", failedTests, "all_completed", allCompleted)

	// Only update session if all tests are complete
	if allCompleted && totalTests > 0 {
		session, err := s.db.GetSession(ctx, testData.SessionID)
		if err != nil {
			logger.WarnContext(ctx, "failed to get session", "session_id", testData.SessionID, "error", err)
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
				if err.Error() == "version conflict: session was modified by another process" {
					logger.InfoContext(ctx, "session already finalized by another process", "session_id", session.ID)
				} else {
					logger.WarnContext(ctx, "failed to update session status", "error", err)
				}
			} else {
				logger.InfoContext(ctx, "session marked as complete", "session_id", testData.SessionID, "status", finalStatus, "passed", passedTests, "total", totalTests)
			}
		} else if session != nil {
			logger.DebugContext(ctx, "session already finalized, skipping update", "session_id", session.ID, "status", session.Status)
		}
	}

	return nil
}

func (s *Service) processTestResultChangeInTx(ctx context.Context, tx db.Tx, change *types.SyncChange, _ *types.SyncBatchResponse, userID string) error {
	if change.ChangeType == "delete" {
		return tx.DeleteTestResult(ctx, change.EntityID)
	}

	var testData types.TestResultData
	if err := json.Unmarshal(change.Data, &testData); err != nil {
		return fmt.Errorf("failed to unmarshal test result data: %w", err)
	}
	existing, err := tx.GetTestResult(ctx, testData.ID)
	if err == nil && existing != nil {
		logger.DebugContext(ctx, "test result: updating existing result", "test_id", testData.ID, "old_status", existing.Status, "new_status", testData.Status)
	} else {
		logger.DebugContext(ctx, "test result: new test result for session", "test_id", testData.ID, "session_id", testData.SessionID, "status", testData.Status)
	}

	result := &db.TestResult{
		ID:            testData.ID,
		SessionID:     testData.SessionID,
		WorkflowRunID: testData.WorkflowRunID,
		WorkflowID:    testData.WorkflowID,
		ScenarioID:    testData.ScenarioID,
		ScenarioName:  testData.ScenarioName,
		TestName:      testData.TestName,
		TestType:      testData.TestType,
		Status:        testData.Status,
		ResultData:    testData.ResultData,
		DurationMs:    testData.DurationMs,
		ExecutedAt:    testData.ExecutedAt,
		CreatedAt:     testData.CreatedAt,
		UpdatedAt:     testData.UpdatedAt,
		ClientID:      testData.ClientID,
		UserID:        userID,
		IsDeleted:     testData.IsDeleted,
	}

	if err := tx.UpsertTestResult(ctx, result); err != nil {
		return fmt.Errorf("failed to upsert test result: %w", err)
	}

	logger.DebugContext(ctx, "test result saved successfully", "test_id", testData.ID)

	testResults, err := tx.ListTestResult(ctx, testData.SessionID)
	if err != nil {
		logger.WarnContext(ctx, "failed to list test result for session", "session_id", testData.SessionID, "error", err)
		return nil
	}

	logger.DebugContext(ctx, "session test result count", "session_id", testData.SessionID, "test_result_count", len(testResults))

	allCompleted := true
	totalTests := 0
	passedTests := 0
	failedTests := 0

	for _, tr := range testResults {
		if tr.IsDeleted {
			continue
		}
		totalTests++
		logger.DebugContext(ctx, "test result detail", "test_id", tr.ID, "status", tr.Status, "test_name", tr.TestName)
		switch tr.Status {
		case "passed":
			passedTests++
		case "failed":
			failedTests++
		default:
			allCompleted = false
		}
	}

	logger.InfoContext(ctx, "session test summary", "session_id", testData.SessionID, "total", totalTests, "passed", passedTests, "failed", failedTests, "all_completed", allCompleted)
	if allCompleted && totalTests > 0 {
		session, err := tx.GetSession(ctx, testData.SessionID)
		if err != nil {
			logger.WarnContext(ctx, "failed to get session", "session_id", testData.SessionID, "error", err)
			return nil
		}

		if session != nil && session.Status != "completed" && session.Status != "failed" {
			finalStatus := "completed"
			if failedTests > 0 {
				finalStatus = "failed"
			}

			session.Status = finalStatus
			now := time.Now()
			session.CompletedAt = &now
			session.UpdatedAt = now
			session.Version++

			summary := map[string]any{
				"total":  totalTests,
				"passed": passedTests,
				"failed": failedTests,
			}
			summaryJSON, _ := json.Marshal(summary)
			session.Result = string(summaryJSON)

			if err := tx.UpsertSession(ctx, session); err != nil {
				if err.Error() == "version conflict: session was modified by another process" {
					logger.InfoContext(ctx, "session already finalized by another process", "session_id", session.ID)
					return nil
				}
				logger.WarnContext(ctx, "failed to update session status", "error", err)
			} else {
				logger.InfoContext(ctx, "session marked as complete", "session_id", testData.SessionID, "status", finalStatus, "passed", passedTests, "total", totalTests)
			}
		} else if session != nil {
			logger.DebugContext(ctx, "session already finalized , skipping update", "session_id", session.ID, "status", session.Status)
		}
	}
	return nil
}

// --- Health check ---
func (s *Service) GetStatus(ctx context.Context) (*types.SyncStatusResponse, error) {
	logger.DebugContext(ctx, "checking sync service status")
	if err := s.db.Ping(ctx); err != nil {
		logger.WarnContext(ctx, "database ping failed", "error", err)
		return &types.SyncStatusResponse{
			Status:        "down",
			ServerVersion: 0,
			TimeStamp:     time.Now(),
		}, nil
	}

	logger.DebugContext(ctx, "sync service is healthy")
	return &types.SyncStatusResponse{
		Status:        "healthy",
		ServerVersion: 1, // or can fetch last sync version globally
		TimeStamp:     time.Now(),
	}, nil
}

// --- Pull changes for a user ---
func (s *Service) PullChanges(ctx context.Context, userID string) (*types.SyncPullResponse, error) {
	logger.InfoContext(ctx, "pulling changes for user", "user_id", userID)

	response := &types.SyncPullResponse{
		Workflows:    []types.WorkflowData{},
		Scenarios:    []types.ScenarioData{},
		WorkflowRuns: []types.WorkflowRunData{},
		Sessions:     []types.SessionData{},
		TestResults:  []types.TestResultData{},
	}

	workflows, err := s.db.ListWorkflows(ctx, userID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to list workflows", "error", err, "user_id", userID)
		return nil, fmt.Errorf("failed to list workflows: %w", err)
	}

	scenarios, err := s.db.ListScenariosByUserId(ctx, userID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to list scenarios", "error", err, "user_id", userID)
		return nil, fmt.Errorf("failed to list scenarios: %w", err)
	}

	workflowRuns, err := s.db.ListWorkflowRunsByUserId(ctx, userID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to list workflow runs", "error", err, "user_id", userID)
		return nil, fmt.Errorf("failed to list workflow runs: %w", err)
	}

	sessions, err := s.db.ListSessionsByUserId(ctx, userID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to list sessions", "error", err, "user_id", userID)
		return nil, fmt.Errorf("failed to list sessions: %w", err)
	}

	testResults, err := s.db.ListTestResultsByUserId(ctx, userID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to list test results", "error", err, "user_id", userID)
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

	for _, scenario := range scenarios {
		response.Scenarios = append(response.Scenarios, types.ScenarioData{
			ID:          scenario.ID,
			WorkflowID:  scenario.WorkflowID,
			UserID:      scenario.UserID,
			Name:        scenario.Name,
			Description: scenario.Description,
			TestsConfig: json.RawMessage(scenario.TestsConfig),
			TestOrder:   json.RawMessage(scenario.TestOrder),
			Metadata:    json.RawMessage(scenario.Metadata),
			Version:     scenario.Version,
			CreatedAt:   scenario.CreatedAt,
			UpdatedAt:   scenario.UpdatedAt,
			ClientID:    scenario.ClientID,
			IsDeleted:   scenario.IsDeleted,
		})
	}

	for _, workflowRun := range workflowRuns {
		response.WorkflowRuns = append(response.WorkflowRuns, types.WorkflowRunData{
			ID:          workflowRun.ID,
			WorkflowID:  workflowRun.WorkflowID,
			UserID:      workflowRun.UserID,
			Status:      workflowRun.Status,
			Summary:     json.RawMessage(workflowRun.Summary),
			Logs:        json.RawMessage(workflowRun.Logs),
			Error:       workflowRun.Error,
			StartedAt:   workflowRun.StartedAt,
			CompletedAt: workflowRun.CompletedAt,
			Metadata:    json.RawMessage(workflowRun.Metadata),
			Version:     workflowRun.Version,
			CreatedAt:   workflowRun.CreatedAt,
			UpdatedAt:   workflowRun.UpdatedAt,
			ClientID:    workflowRun.ClientID,
			IsDeleted:   workflowRun.IsDeleted,
		})
	}

	for _, sess := range sessions {
		response.Sessions = append(response.Sessions, types.SessionData{
			ID:               sess.ID,
			UserID:           sess.UserID,
			WorkflowRunID:    sess.WorkflowRunID,
			WorkflowID:       sess.WorkflowID,
			ScenarioID:       sess.ScenarioID,
			ScenarioName:     sess.ScenarioName,
			BackendSessionID: sess.BackendSessionID,
			Status:           sess.Status,
			Result:           json.RawMessage(sess.Result),
			ContainerIDs:     json.RawMessage(sess.ContainerIDs),
			Logs:             json.RawMessage(sess.Logs),
			Error:            sess.Error,
			StartedAt:        sess.StartedAt,
			CompletedAt:      sess.CompletedAt,
			Version:          sess.Version,
			CreatedAt:        sess.CreatedAt,
			UpdatedAt:        sess.UpdatedAt,
			ClientID:         sess.ClientID,
			IsDeleted:        sess.IsDeleted,
		})
	}

	for _, testres := range testResults {
		response.TestResults = append(response.TestResults, types.TestResultData{
			ID:            testres.ID,
			UserID:        testres.UserID,
			SessionID:     testres.SessionID,
			WorkflowRunID: testres.WorkflowRunID,
			WorkflowID:    testres.WorkflowID,
			ScenarioID:    testres.ScenarioID,
			ScenarioName:  testres.ScenarioName,
			TestName:      testres.TestName,
			TestType:      testres.TestType,
			Status:        testres.Status,
			ResultData:    testres.ResultData,
			DurationMs:    testres.DurationMs,
			ExecutedAt:    testres.ExecutedAt,
			CreatedAt:     testres.CreatedAt,
			UpdatedAt:     testres.UpdatedAt,
			ClientID:      testres.ClientID,
			IsDeleted:     testres.IsDeleted,
		})
	}

	logger.InfoContext(ctx, "changes pulled successfully", "user_id", userID, "workflows_count", len(response.Workflows), "scenarios_count", len(response.Scenarios), "workflow_runs_count", len(response.WorkflowRuns), "sessions_count", len(response.Sessions), "test_results_count", len(response.TestResults))

	return response, nil
}
