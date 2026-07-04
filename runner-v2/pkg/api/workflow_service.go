package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/workflowrun"
	"github.com/google/uuid"
)

type WorkflowService struct {
	handler *Handler
	db      db.Database
	store   db.WorkflowJobStore
	cipher  *workflowrun.PayloadCipher
	config  config.WorkflowWorkerConfig
	ownerID string
	wake    chan struct{}
	wg      sync.WaitGroup
}

func NewWorkflowService(handler *Handler, database db.Database, store db.WorkflowJobStore, cfg config.WorkflowWorkerConfig) (*WorkflowService, error) {
	cipher, err := workflowrun.NewPayloadCipher(cfg.EncryptionKey)
	if err != nil {
		return nil, err
	}
	return &WorkflowService{
		handler: handler, db: database, store: store, cipher: cipher, config: cfg,
		ownerID: runtimeOwnerID(), wake: make(chan struct{}, 1),
	}, nil
}

func (s *WorkflowService) Start(ctx context.Context) {
	for index := 0; index < s.config.Concurrency; index++ {
		s.wg.Add(1)
		go s.worker(ctx, index)
	}
	go s.pruneEvents(ctx)
}

func (s *WorkflowService) Wait() { s.wg.Wait() }

func (s *WorkflowService) Submit(ctx context.Context, request *workflowrun.Request) (*db.WorkflowJob, bool, error) {
	if err := request.Validate(); err != nil {
		return nil, false, err
	}
	workflow, err := s.db.GetWorkflow(ctx, request.WorkflowID)
	if err != nil {
		return nil, false, fmt.Errorf("workflow must be synchronized before execution: %w", err)
	}
	if workflow.ProjectID != request.ProjectID {
		return nil, false, fmt.Errorf("workflow does not belong to the requested project")
	}
	for _, scenario := range request.Scenarios {
		persisted, err := s.db.GetScenario(ctx, scenario.ID)
		if err != nil {
			return nil, false, fmt.Errorf("scenario %q must be synchronized before execution: %w", scenario.Name, err)
		}
		if persisted.ProjectID != request.ProjectID || persisted.WorkflowID != request.WorkflowID || (scenario.ProjectID != "" && scenario.ProjectID != request.ProjectID) {
			return nil, false, fmt.Errorf("scenario %q does not belong to the requested workflow and project", scenario.Name)
		}
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return nil, false, err
	}
	ciphertext, nonce, err := s.cipher.Encrypt(payload)
	if err != nil {
		return nil, false, err
	}
	defer clear(payload)
	now := time.Now().UTC()
	job := &db.WorkflowJob{
		ID: uuid.NewString(), WorkflowRunID: request.WorkflowRunID,
		ProjectID: request.ProjectID, RequestHash: workflowrun.HashPayload(payload),
		PayloadCiphertext: ciphertext, PayloadNonce: nonce,
		Status: "pending", CreatedAt: now, UpdatedAt: now,
	}

	metadata, _ := json.Marshal(map[string]any{
		"scenario_run_ids": scenarioRunIDs(request.Scenarios),
	})
	run := &db.WorkflowRun{
		ID: request.WorkflowRunID, ProjectID: request.ProjectID,
		WorkflowID: request.WorkflowID, Status: "pending", Metadata: string(metadata),
		Version: 1, CreatedAt: now, UpdatedAt: now,
		ClientID: request.ClientID, UserID: firstNonEmpty(request.UserID, "demo-user"),
	}
	sessions := make([]*db.Session, 0, len(request.Scenarios))
	for _, scenario := range request.Scenarios {
		projectID := firstNonEmpty(scenario.ProjectID, request.ProjectID)
		userID := firstNonEmpty(scenario.UserID, request.UserID, "demo-user")
		sessions = append(sessions, &db.Session{
			ID: scenario.ScenarioRunID, ProjectID: projectID,
			WorkflowRunID: request.WorkflowRunID, WorkflowID: request.WorkflowID,
			ScenarioID: scenario.ID, ScenarioName: scenario.Name, Status: "pending",
			Phase: sessionPhaseCreated, Version: 1, CreatedAt: now, UpdatedAt: now,
			ClientID: firstNonEmpty(scenario.ClientID, request.ClientID), UserID: userID,
		})
	}
	job, created, err := s.store.EnqueueWorkflowJob(ctx, job, run, sessions)
	if err != nil || !created {
		return job, created, err
	}
	s.signal()
	return job, true, nil
}

func (s *WorkflowService) worker(ctx context.Context, index int) {
	defer s.wg.Done()
	owner := fmt.Sprintf("%s:worker-%d", s.ownerID, index)
	ticker := time.NewTicker(750 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		case <-s.wake:
		}
		for {
			job, err := s.store.ClaimWorkflowJob(ctx, owner, time.Now().UTC(), time.Duration(s.config.LeaseSeconds)*time.Second, s.config.MaxRecoveries)
			if err != nil {
				logger.ErrorContext(ctx, "failed to claim workflow job", "error", err)
				break
			}
			if job == nil {
				break
			}
			if job.Status == "failed" {
				s.reconcileExhaustedJob(ctx, job)
				continue
			}
			s.executeJob(ctx, owner, job)
		}
	}
}

func (s *WorkflowService) executeJob(parent context.Context, owner string, job *db.WorkflowJob) {
	ctx, cancel := context.WithCancelCause(parent)
	defer cancel(nil)
	go s.heartbeat(ctx, owner, job.ID, cancel)

	payload, err := s.cipher.Decrypt(job.PayloadCiphertext, job.PayloadNonce)
	if err != nil {
		s.failJob(ctx, owner, job, err)
		return
	}
	defer clear(payload)
	var request workflowrun.Request
	if err := json.Unmarshal(payload, &request); err != nil {
		s.failJob(ctx, owner, job, err)
		return
	}
	bundle, err := request.Bundle()
	if err != nil {
		s.failJob(ctx, owner, job, err)
		return
	}

	if err := s.updateRun(ctx, &request, "running", nil, nil, ""); err != nil {
		s.failJob(ctx, owner, job, fmt.Errorf("persist running workflow state: %w", err))
		return
	}
	s.emitLog(ctx, &request, "Starting workflow run: "+request.WorkflowName, "running", nil, nil)

	results := make([]dto.WorkflowBundleScenarioResponse, len(bundle.Scenarios))
	sem := make(chan struct{}, s.config.ScenarioConcurrency)
	var wg sync.WaitGroup
	for index := range bundle.Scenarios {
		index := index
		wg.Add(1)
		go func() {
			defer wg.Done()
			select {
			case sem <- struct{}{}:
			case <-ctx.Done():
				return
			}
			defer func() { <-sem }()
			scenario := request.Scenarios[index]
			if checkpoint, ok := s.completedScenario(ctx, scenario); ok {
				results[index] = checkpoint
				s.emitLog(ctx, &request, fmt.Sprintf("Restored completed scenario %q from its checkpoint", scenario.Name), mapScenarioStatusValue(checkpoint.Success), &scenario, errorValue(checkpoint.Error))
				return
			}
			if err := s.updateScenario(ctx, scenario, "running", "", ""); err != nil {
				results[index] = dto.WorkflowBundleScenarioResponse{ScenarioName: scenario.Name, Success: false, Error: "failed to persist running scenario state: " + err.Error(), Summary: dto.TestSummary{Total: len(scenario.Tests)}}
				return
			}
			s.emitLog(ctx, &request, fmt.Sprintf("Running scenario %q", scenario.Name), "running", &scenario, nil)
			result := s.handler.runWorkflowBundleScenarioForRun(ctx, bundle, bundle.Scenarios[index], &dto.ExecutionContextDTO{
				SessionID: scenario.ScenarioRunID, ProjectID: firstNonEmpty(scenario.ProjectID, request.ProjectID),
				UserID: firstNonEmpty(scenario.UserID, request.UserID, "demo-user"), ClientID: firstNonEmpty(scenario.ClientID, request.ClientID),
				WorkflowID: request.WorkflowID, WorkflowRunID: request.WorkflowRunID,
				ScenarioID: scenario.ID, ScenarioName: scenario.Name,
			})
			results[index] = result
			if ctx.Err() != nil {
				return
			}
			status := "completed"
			if !result.Success {
				status = "failed"
			}
			if err := s.updateScenario(ctx, scenario, status, result.SessionID, result.Error); err != nil {
				result.Success = false
				if result.Error != "" {
					result.Error += "; "
				}
				result.Error += "failed to persist scenario state: " + err.Error()
				results[index] = result
			}
			s.emitTestResults(ctx, &request, scenario, result)
			s.emitLog(ctx, &request, fmt.Sprintf("Scenario %q %s", scenario.Name, status), mapScenarioStatus(status), &scenario, errorValue(result.Error))
		}()
	}
	wg.Wait()
	if ctx.Err() != nil {
		if err := s.store.ReleaseWorkflowJob(context.WithoutCancel(ctx), job.ID, owner, time.Now().UTC()); err != nil {
			logger.Error("failed to release interrupted workflow job", "workflow_run_id", job.WorkflowRunID, "error", err)
		}
		return
	}

	summary := dto.WorkflowBundleRunSummary{TotalScenarios: len(results)}
	success := true
	for _, result := range results {
		summary.TotalTests += result.Summary.Total
		summary.PassedTests += result.Summary.Passed
		summary.FailedTests += result.Summary.Failed
		if result.Success {
			summary.PassedScenarios++
		} else {
			summary.FailedScenarios++
			success = false
		}
	}
	status := "completed"
	if !success && summary.PassedScenarios > 0 {
		status = "partial_failed"
	} else if !success {
		status = "failed"
	}
	resultPayload := map[string]any{
		"success": success, "status": status,
		"totalScenarios": summary.TotalScenarios, "passedScenarios": summary.PassedScenarios,
		"failedScenarios": summary.FailedScenarios, "totalTests": summary.TotalTests,
		"passedTests": summary.PassedTests, "failedTests": summary.FailedTests,
		"scenarioResults": scenarioSnapshots(request.Scenarios, results),
	}
	logs := []string{fmt.Sprintf("Workflow run complete: %d/%d scenarios passed", summary.PassedScenarios, summary.TotalScenarios)}
	if err := s.updateRun(ctx, &request, status, nil, resultPayload, workflowErrors(request.Scenarios, results)); err != nil {
		s.failJob(ctx, owner, job, fmt.Errorf("persist terminal workflow state: %w", err))
		return
	}
	s.emitLog(ctx, &request, logs[len(logs)-1], mapWorkflowStatus(status), nil, resultPayload)
	if err := s.store.CompleteWorkflowJob(ctx, job.ID, owner, time.Now().UTC()); err != nil {
		logger.ErrorContext(ctx, "failed to complete workflow job", "error", err)
	}
}

func (s *WorkflowService) completedScenario(ctx context.Context, scenario workflowrun.Scenario) (dto.WorkflowBundleScenarioResponse, bool) {
	persisted, err := s.db.GetSession(ctx, scenario.ScenarioRunID)
	if err != nil || (persisted.Status != "completed" && persisted.Status != "failed") {
		return dto.WorkflowBundleScenarioResponse{}, false
	}
	response := dto.WorkflowBundleScenarioResponse{
		ScenarioName: scenario.Name, SessionID: persisted.BackendSessionID,
		Success: persisted.Status == "completed", Error: persisted.Error,
		Summary: dto.TestSummary{Total: len(scenario.Tests)},
	}
	rows, err := s.db.ListTestResults(ctx, scenario.ScenarioRunID)
	if err != nil {
		return dto.WorkflowBundleScenarioResponse{}, false
	}
	byName := make(map[string]dto.TestResult, len(rows))
	for _, row := range rows {
		var result dto.TestResult
		_ = json.Unmarshal([]byte(row.ResultData), &result)
		result.Name, result.Type, result.Passed = row.TestName, row.TestType, row.Status == "passed"
		byName[row.TestName] = result
	}
	for _, testDefinition := range scenario.Tests {
		result, ok := byName[testDefinition.Name]
		if !ok {
			continue
		}
		response.Results = append(response.Results, result)
		if result.Passed {
			response.Summary.Passed++
		} else {
			response.Summary.Failed++
		}
	}
	return response, true
}

func (s *WorkflowService) heartbeat(ctx context.Context, owner, jobID string, cancel context.CancelCauseFunc) {
	ticker := time.NewTicker(time.Duration(s.config.HeartbeatSeconds) * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-ticker.C:
			if err := s.store.HeartbeatWorkflowJob(ctx, jobID, owner, now.UTC(), time.Duration(s.config.LeaseSeconds)*time.Second); err != nil {
				logger.ErrorContext(ctx, "workflow lease heartbeat failed; cancelling execution", "job_id", jobID, "error", err)
				cancel(fmt.Errorf("workflow lease heartbeat failed: %w", err))
				return
			}
		}
	}
}

func (s *WorkflowService) failJob(ctx context.Context, owner string, job *db.WorkflowJob, err error) {
	now := time.Now().UTC()
	_ = s.store.FailWorkflowJob(ctx, job.ID, owner, err.Error(), now)
	run, getErr := s.db.GetWorkflowRun(ctx, job.WorkflowRunID)
	if getErr == nil {
		run.Status, run.Error, run.UpdatedAt, run.CompletedAt, run.Version = "failed", err.Error(), now, &now, run.Version+1
		_ = s.db.UpsertWorkflowRun(ctx, run)
	}
	s.appendLogEvent(ctx, job.WorkflowRunID, job.ProjectID, "Workflow run failed: "+err.Error(), map[string]any{
		"workflowRunId": job.WorkflowRunID, "projectId": job.ProjectID,
		"message": "Workflow run failed: " + err.Error(), "status": "failed",
		"error": err.Error(), "timestamp": now.UnixMilli(), "sequence": now.UnixNano(),
	})
}

func (s *WorkflowService) reconcileExhaustedJob(ctx context.Context, job *db.WorkflowJob) {
	now := time.Now().UTC()
	run, err := s.db.GetWorkflowRun(ctx, job.WorkflowRunID)
	if err == nil {
		run.Status, run.Error, run.UpdatedAt, run.CompletedAt, run.Version = "failed", job.LastError, now, &now, run.Version+1
		_ = s.db.UpsertWorkflowRun(ctx, run)
	}
	s.appendLogEvent(ctx, job.WorkflowRunID, job.ProjectID, "Workflow run failed after repeated runner interruptions", map[string]any{
		"workflowRunId": job.WorkflowRunID, "projectId": job.ProjectID,
		"message": "Workflow run failed after repeated runner interruptions", "status": "failed",
		"error": job.LastError, "timestamp": now.UnixMilli(), "sequence": now.UnixNano(),
	})
}

func (s *WorkflowService) signal() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func scenarioRunIDs(scenarios []workflowrun.Scenario) []string {
	ids := make([]string, len(scenarios))
	for i := range scenarios {
		ids[i] = scenarios[i].ScenarioRunID
	}
	return ids
}

func (s *WorkflowService) updateRun(ctx context.Context, request *workflowrun.Request, status string, logs []string, result any, message string) error {
	run, err := s.db.GetWorkflowRun(ctx, request.WorkflowRunID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	run.Status, run.UpdatedAt, run.Version = status, now, run.Version+1
	if logs != nil {
		encodedLogs, err := json.Marshal(logs)
		if err != nil {
			return err
		}
		run.Logs = string(encodedLogs)
	}
	if result != nil {
		encoded, _ := json.Marshal(result)
		run.Summary = string(encoded)
	}
	if message != "" {
		run.Error = message
	}
	if status != "pending" && status != "running" {
		run.CompletedAt = &now
	}
	if run.StartedAt == nil {
		run.StartedAt = &now
	}
	if err := s.db.UpsertWorkflowRun(ctx, run); err != nil {
		return err
	}
	return nil
}

func (s *WorkflowService) updateScenario(ctx context.Context, scenario workflowrun.Scenario, status, backendID, message string) error {
	run, err := s.db.GetSession(ctx, scenario.ScenarioRunID)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	run.Status, run.UpdatedAt, run.Version = status, now, run.Version+1
	if backendID != "" {
		run.BackendSessionID = backendID
	}
	if message != "" {
		run.Error = message
	}
	if run.StartedAt == nil {
		run.StartedAt = &now
	}
	if status == "completed" || status == "failed" {
		run.CompletedAt = &now
		if status == "completed" {
			run.Phase = sessionPhaseCompleted
		} else {
			run.Phase = sessionPhaseFailed
		}
	}
	if err := s.db.UpsertSession(ctx, run); err != nil {
		return err
	}
	return nil
}

func (s *WorkflowService) emitLog(ctx context.Context, request *workflowrun.Request, message, status string, scenario *workflowrun.Scenario, result any) {
	now := time.Now().UTC()
	payload := map[string]any{"workflowRunId": request.WorkflowRunID, "projectId": request.ProjectID, "workflowId": request.WorkflowID, "message": message, "status": status, "timestamp": now.UnixMilli(), "sequence": now.UnixNano()}
	scenarioRunID := ""
	if scenario != nil {
		payload["scenarioId"], payload["scenarioName"] = scenario.ID, scenario.Name
		scenarioRunID = scenario.ScenarioRunID
	}
	if result != nil {
		if value, ok := result.(error); ok {
			payload["error"] = value.Error()
		} else {
			payload["result"] = result
		}
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		logger.ErrorContext(ctx, "failed to encode workflow log event", "error", err)
		return
	}
	if _, err := s.store.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: request.WorkflowRunID, EventType: "workflowlog", Payload: string(encoded), CreatedAt: now}, message, scenarioRunID); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow log event", "workflow_run_id", request.WorkflowRunID, "error", err)
	}
}

func (s *WorkflowService) emitTestResults(ctx context.Context, request *workflowrun.Request, scenario workflowrun.Scenario, response dto.WorkflowBundleScenarioResponse) {
	results := make([]map[string]any, 0, len(response.Results))
	now := time.Now().UTC()
	for index, result := range response.Results {
		status := "failed"
		if result.Passed {
			status = "passed"
		}
		results = append(results, map[string]any{"testResultId": request.WorkflowRunID + "_" + scenario.ID + "_" + result.Name, "testName": result.Name, "testType": result.Type, "status": status, "resultData": result, "durationMs": 0, "executedAt": now.Format(time.RFC3339Nano), "action": "update", "containerLogs": result.ContainerLogs, "sequence": index})
	}
	s.appendEvent(ctx, request.WorkflowRunID, "testresult", map[string]any{"workflowRunId": request.WorkflowRunID, "projectId": request.ProjectID, "workflowId": request.WorkflowID, "scenarioId": scenario.ID, "scenarioName": scenario.Name, "backendSessionId": response.SessionID, "bulkId": uuid.NewString(), "timestamp": now.UnixMilli(), "results": results})
}

func (s *WorkflowService) appendEvent(ctx context.Context, runID, eventType string, payload any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return
	}
	if _, err := s.store.AppendWorkflowRunEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: runID, EventType: eventType, Payload: string(encoded), CreatedAt: time.Now().UTC()}); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow event", "workflow_run_id", runID, "event_type", eventType, "error", err)
	}
}

func (s *WorkflowService) appendLogEvent(ctx context.Context, runID, projectID, message string, payload any) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		logger.ErrorContext(ctx, "failed to encode workflow log event", "workflow_run_id", runID, "error", err)
		return
	}
	if _, err := s.store.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: runID, EventType: "workflowlog", Payload: string(encoded), CreatedAt: time.Now().UTC()}, message, ""); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow failure event", "workflow_run_id", runID, "project_id", projectID, "error", err)
	}
}

func (s *WorkflowService) pruneEvents(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		_ = s.store.DeleteWorkflowRunEventsBefore(ctx, time.Now().UTC().AddDate(0, 0, -s.config.EventRetentionDays))
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func scenarioSnapshots(scenarios []workflowrun.Scenario, results []dto.WorkflowBundleScenarioResponse) []map[string]any {
	values := make([]map[string]any, len(results))
	for i := range results {
		values[i] = map[string]any{"scenarioId": scenarios[i].ID, "scenarioName": scenarios[i].Name, "backendSessionId": results[i].SessionID, "success": results[i].Success, "status": mapScenarioStatusValue(results[i].Success), "error": results[i].Error}
	}
	return values
}
func workflowErrors(scenarios []workflowrun.Scenario, results []dto.WorkflowBundleScenarioResponse) string {
	message := ""
	for i, result := range results {
		if result.Error != "" {
			if message != "" {
				message += "\n"
			}
			message += scenarios[i].Name + ": " + result.Error
		}
	}
	return message
}
func mapScenarioStatusValue(success bool) string {
	if success {
		return "completed"
	}
	return "failed"
}
func mapScenarioStatus(status string) string {
	if status == "completed" {
		return "completed"
	}
	return "failed"
}
func mapWorkflowStatus(status string) string {
	if status == "completed" {
		return "completed"
	}
	return "failed"
}
func errorValue(value string) any {
	if value == "" {
		return nil
	}
	return errors.New(value)
}
