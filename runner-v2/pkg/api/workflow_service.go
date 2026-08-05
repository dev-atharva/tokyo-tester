package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/dto"
	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/executionevent"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/runsecret"
	"github.com/dev-atharva/cots/pkg/workflowbundle"
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
	if err := runsecret.RequireHumanAuthorization(request); err != nil {
		return nil, false, err
	}
	secrets, err := runsecret.Authorize(request, nil)
	if err != nil {
		return nil, false, err
	}
	defer secrets.Destroy()
	return s.SubmitAuthorized(ctx, request, secrets)
}

func (s *WorkflowService) AuthorizeAndSubmit(ctx context.Context, request *workflowrun.Request, supplied []runsecret.SuppliedValue) (*db.WorkflowJob, bool, error) {
	if err := s.reloadAuthorizedSelection(ctx, request); err != nil {
		return nil, false, err
	}
	secrets, err := runsecret.Authorize(request, supplied)
	if err != nil {
		return nil, false, err
	}
	defer secrets.Destroy()
	return s.SubmitAuthorized(ctx, request, secrets)
}

func (s *WorkflowService) reloadAuthorizedSelection(ctx context.Context, request *workflowrun.Request) error {
	if request == nil || strings.TrimSpace(request.ProjectID) == "" || strings.TrimSpace(request.WorkflowID) == "" || len(request.Scenarios) == 0 {
		return errors.New("projectId, workflowId, and at least one selected scenario are required")
	}
	workflow, err := s.db.GetWorkflow(ctx, request.WorkflowID)
	if err != nil || workflow.ProjectID != request.ProjectID || workflow.IsDeleted {
		return errors.New("workflow was not found in the authorized project")
	}
	var nodes []workflowbundle.FlowNode
	var edges []workflowbundle.FlowEdge
	if err := json.Unmarshal([]byte(workflow.NodesConfig), &nodes); err != nil {
		return fmt.Errorf("decode synchronized workflow nodes: %w", err)
	}
	if err := json.Unmarshal([]byte(workflow.EdgesConfig), &edges); err != nil {
		return fmt.Errorf("decode synchronized workflow edges: %w", err)
	}
	request.WorkflowName, request.Nodes, request.Edges = workflow.Name, nodes, edges
	for index := range request.Scenarios {
		selected := &request.Scenarios[index]
		persisted, err := s.db.GetScenario(ctx, selected.ID)
		if err != nil || persisted.ProjectID != request.ProjectID || persisted.WorkflowID != request.WorkflowID || persisted.IsDeleted {
			return fmt.Errorf("selected scenario %q is stale or outside the authorized workflow", selected.ID)
		}
		var tests []workflowbundle.ScenarioTestDefinition
		var testOrder []string
		var environment *workflowbundle.JourneyEnvironment
		var steps []workflowbundle.ScenarioStep
		var stepOrder []string
		if err := decodeStoredJSON(persisted.TestsConfig, &tests); err != nil {
			return fmt.Errorf("decode synchronized scenario tests: %w", err)
		}
		if err := decodeStoredJSON(persisted.TestOrder, &testOrder); err != nil {
			return fmt.Errorf("decode synchronized scenario test order: %w", err)
		}
		if err := decodeStoredJSON(persisted.EnvironmentConfig, &environment); err != nil {
			return fmt.Errorf("decode synchronized journey environment: %w", err)
		}
		if err := decodeStoredJSON(persisted.StepsConfig, &steps); err != nil {
			return fmt.Errorf("decode synchronized journey steps: %w", err)
		}
		if err := decodeStoredJSON(persisted.StepOrder, &stepOrder); err != nil {
			return fmt.Errorf("decode synchronized journey step order: %w", err)
		}
		selected.ProjectID = request.ProjectID
		selected.Name, selected.Description = persisted.Name, persisted.Description
		selected.ExecutionModel = persisted.ExecutionModel
		selected.Tests, selected.TestOrder = tests, testOrder
		selected.Environment, selected.Steps, selected.StepOrder = environment, steps, stepOrder
		normalizeScenarioExecutionFields(selected)
	}
	return request.Validate()
}

func normalizeScenarioExecutionFields(scenario *workflowrun.Scenario) {
	if scenario.ExecutionModel == workflowbundle.ExecutionModelJourney {
		scenario.Tests, scenario.TestOrder = nil, nil
		return
	}
	scenario.Environment, scenario.Steps, scenario.StepOrder = nil, nil, nil
}

func decodeStoredJSON(value string, destination any) error {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return json.Unmarshal([]byte(value), destination)
}

func (s *WorkflowService) SubmitAuthorized(ctx context.Context, request *workflowrun.Request, secrets *runsecret.RunSecrets) (*db.WorkflowJob, bool, error) {
	if err := request.Validate(); err != nil {
		return nil, false, err
	}
	if err := secrets.ValidateFor(request); err != nil {
		return nil, false, err
	}
	candidateHash, err := workflowRequestFingerprint(request)
	if err != nil {
		return nil, false, err
	}
	if existing, err := s.store.GetWorkflowJob(ctx, request.WorkflowRunID); err == nil && existing != nil {
		if existing.RequestHash == candidateHash {
			return existing, false, nil
		}
		if len(existing.PayloadCiphertext) == 0 || len(existing.PayloadNonce) == 0 {
			return nil, false, fmt.Errorf("workflow run id already exists with a different payload")
		}
		payload, decryptErr := s.cipher.Decrypt(existing.PayloadCiphertext, existing.PayloadNonce)
		if decryptErr != nil {
			return nil, false, decryptErr
		}
		defer clear(payload)
		submitted, submittedSecrets, err := runsecret.DecodeJobPayload(payload)
		if err != nil {
			return nil, false, err
		}
		defer submittedSecrets.Destroy()
		submittedHash, err := workflowRequestFingerprint(submitted)
		if err != nil || submittedHash != candidateHash {
			return nil, false, fmt.Errorf("workflow run id already exists with a different payload")
		}
		request.WorkflowRevisionID = submitted.WorkflowRevisionID
		return existing, false, nil
	}
	workflow, persistedScenarios, err := s.ensureWorkflowGraphForRun(ctx, request)
	if err != nil {
		return nil, false, err
	}
	if revisions, ok := s.db.(db.WorkflowRevisionStore); ok {
		executedWorkflow := *workflow
		nodes, _ := json.Marshal(request.Nodes)
		edges, _ := json.Marshal(request.Edges)
		executedWorkflow.NodesConfig, executedWorkflow.EdgesConfig = string(nodes), string(edges)
		executedScenarios := make([]*db.Scenario, 0, len(request.Scenarios))
		for _, scenario := range request.Scenarios {
			persisted := persistedScenarios[scenario.ID]
			tests, _ := json.Marshal(scenario.Tests)
			order, _ := json.Marshal(scenario.TestOrder)
			environment, _ := json.Marshal(scenario.Environment)
			steps, _ := json.Marshal(scenario.Steps)
			stepOrder, _ := json.Marshal(scenario.StepOrder)
			executionModel := scenario.ExecutionModel
			if executionModel == "" {
				executionModel = workflowbundle.ExecutionModelLegacyTests
			}
			copy := *persisted
			copy.Name, copy.Description, copy.ExecutionModel = scenario.Name, scenario.Description, executionModel
			copy.TestsConfig, copy.TestOrder = string(tests), string(order)
			copy.EnvironmentConfig, copy.StepsConfig, copy.StepOrder = string(environment), string(steps), string(stepOrder)
			executedScenarios = append(executedScenarios, &copy)
		}
		snapshot, err := json.Marshal(db.WorkflowSnapshot{Workflow: &executedWorkflow, Scenarios: executedScenarios})
		if err != nil {
			return nil, false, err
		}
		revision := &db.WorkflowRevision{
			ID: uuid.NewString(), ProjectID: request.ProjectID, WorkflowID: request.WorkflowID,
			WorkflowVersion: workflow.Version, Snapshot: string(snapshot), Message: "Execution checkpoint",
			CreatedBy: firstNonEmpty(request.UserID, "system"), CreatedAt: time.Now().UTC(),
		}
		if err := revisions.CreateWorkflowRevision(ctx, revision); err != nil {
			return nil, false, fmt.Errorf("create execution revision: %w", err)
		}
		request.WorkflowRevisionID = revision.ID
	}
	payload, err := runsecret.EncodeJobPayload(request, secrets)
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
		ProjectID: request.ProjectID, UserID: firstNonEmpty(request.UserID, "demo-user"),
		RequestHash:       candidateHash,
		PayloadCiphertext: ciphertext, PayloadNonce: nonce,
		Status: "pending", EstimatedCost: estimateWorkflowCost(request), CreatedAt: now, UpdatedAt: now,
	}

	metadata, _ := json.Marshal(map[string]any{
		"scenario_run_ids":     scenarioRunIDs(request.Scenarios),
		"workflow_revision_id": request.WorkflowRevisionID,
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
	job, created, err := s.store.AdmitWorkflowJob(ctx, job, run, sessions, s.admissionPolicy())
	if err != nil || !created {
		return job, created, err
	}
	s.signal()
	return job, true, nil
}

func workflowRequestFingerprint(request *workflowrun.Request) (string, error) {
	copy := *request
	copy.WorkflowRevisionID = ""
	copy.RegistrySecrets = nil
	payload, err := json.Marshal(&copy)
	if err != nil {
		return "", err
	}
	defer clear(payload)
	return workflowrun.HashPayload(payload), nil
}

func (s *WorkflowService) ensureWorkflowGraphForRun(ctx context.Context, request *workflowrun.Request) (*db.Workflow, map[string]*db.Scenario, error) {
	now := time.Now().UTC()
	workflow, err := s.db.GetWorkflow(ctx, request.WorkflowID)
	if err != nil {
		nodes, _ := json.Marshal(request.Nodes)
		edges, _ := json.Marshal(request.Edges)
		workflow = &db.Workflow{
			ID: request.WorkflowID, ProjectID: request.ProjectID, Name: request.WorkflowName,
			NodesConfig: string(nodes), EdgesConfig: string(edges), Metadata: `{}`,
			Version: 1, CreatedAt: now, UpdatedAt: now,
			ClientID: request.ClientID, UserID: firstNonEmpty(request.UserID, "demo-user"),
		}
		if err := s.db.UpsertWorkflow(ctx, workflow); err != nil {
			return nil, nil, fmt.Errorf("workflow must be synchronized before execution: %w", err)
		}
	} else if workflow.ProjectID != request.ProjectID {
		return nil, nil, fmt.Errorf("workflow does not belong to the requested project")
	}

	persistedScenarios := make(map[string]*db.Scenario, len(request.Scenarios))
	for _, scenario := range request.Scenarios {
		persisted, err := s.db.GetScenario(ctx, scenario.ID)
		if err != nil {
			tests, _ := json.Marshal(scenario.Tests)
			order, _ := json.Marshal(scenario.TestOrder)
			environment, _ := json.Marshal(scenario.Environment)
			steps, _ := json.Marshal(scenario.Steps)
			stepOrder, _ := json.Marshal(scenario.StepOrder)
			executionModel := scenario.ExecutionModel
			if executionModel == "" {
				executionModel = workflowbundle.ExecutionModelLegacyTests
			}
			persisted = &db.Scenario{
				ID: scenario.ID, ProjectID: firstNonEmpty(scenario.ProjectID, request.ProjectID), WorkflowID: request.WorkflowID,
				Name: scenario.Name, Description: scenario.Description, ExecutionModel: executionModel,
				TestsConfig: string(tests), TestOrder: string(order), EnvironmentConfig: string(environment), StepsConfig: string(steps), StepOrder: string(stepOrder), Metadata: `{}`,
				Version: 1, CreatedAt: now, UpdatedAt: now,
				ClientID: firstNonEmpty(scenario.ClientID, request.ClientID), UserID: firstNonEmpty(scenario.UserID, request.UserID, "demo-user"),
			}
			if err := s.db.UpsertScenario(ctx, persisted); err != nil {
				return nil, nil, fmt.Errorf("scenario %q must be synchronized before execution: %w", scenario.Name, err)
			}
		}
		if persisted.ProjectID != request.ProjectID || persisted.WorkflowID != request.WorkflowID || (scenario.ProjectID != "" && scenario.ProjectID != request.ProjectID) {
			return nil, nil, fmt.Errorf("scenario %q does not belong to the requested workflow and project", scenario.Name)
		}
		persistedScenarios[scenario.ID] = persisted
	}
	return workflow, persistedScenarios, nil
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
			job, err := s.store.ClaimWorkflowJobFair(ctx, owner, time.Now().UTC(), time.Duration(s.config.LeaseSeconds)*time.Second, s.config.MaxRecoveries, s.admissionPolicy())
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
			if job.CancelRequestedAt != nil {
				if err := s.store.CancelWorkflowJob(ctx, job.ID, owner, time.Now().UTC()); err != nil {
					logger.ErrorContext(ctx, "failed to finalize recovered workflow cancellation", "workflow_run_id", job.WorkflowRunID, "error", err)
				}
				continue
			}
			s.executeJob(ctx, owner, job)
		}
	}
}

func (s *WorkflowService) Cancel(ctx context.Context, workflowRunID, projectID, reason string) (*db.WorkflowJob, bool, error) {
	return s.store.RequestWorkflowJobCancellation(ctx, workflowRunID, projectID, reason, time.Now().UTC())
}

func (s *WorkflowService) admissionPolicy() db.WorkflowAdmissionPolicy {
	return db.WorkflowAdmissionPolicy{
		MaxQueuedGlobal: s.config.MaxQueuedGlobal, MaxQueuedPerUser: s.config.MaxQueuedPerUser,
		MaxQueuedPerProject: s.config.MaxQueuedPerProject, MaxRunningPerUser: s.config.MaxRunningPerUser,
		SubmissionsPerMinuteUser:    s.config.SubmissionsPerMinuteUser,
		SubmissionsPerMinuteProject: s.config.SubmissionsPerMinuteProject,
		MaxRunningPerProject:        s.config.MaxRunningPerProject,
	}
}

func (s *WorkflowService) QueueInfo(ctx context.Context, workflowRunID string) (*db.WorkflowQueueInfo, error) {
	info, err := s.store.GetWorkflowJobQueueInfo(ctx, workflowRunID)
	if info != nil {
		info.WorkerConcurrency = s.config.Concurrency
		if info.Status == "pending" && info.EstimatedRun != nil && info.Position > 1 {
			waves := (info.Position - 1 + maxIntAPI(s.config.Concurrency, 1) - 1) / maxIntAPI(s.config.Concurrency, 1)
			info.EstimatedWait = scaleWorkflowEstimate(info.EstimatedRun, waves)
			info.EstimatedTotal = addWorkflowEstimates(info.EstimatedWait, info.EstimatedRun)
		} else if info.EstimatedRun != nil {
			info.EstimatedTotal = scaleWorkflowEstimate(info.EstimatedRun, 1)
		}
	}
	return info, err
}

func scaleWorkflowEstimate(estimate *db.WorkflowTimeEstimate, multiplier int) *db.WorkflowTimeEstimate {
	if estimate == nil {
		return nil
	}
	return &db.WorkflowTimeEstimate{
		P50Seconds: estimate.P50Seconds * multiplier,
		P90Seconds: estimate.P90Seconds * multiplier,
		SampleSize: estimate.SampleSize,
	}
}

func addWorkflowEstimates(left, right *db.WorkflowTimeEstimate) *db.WorkflowTimeEstimate {
	if left == nil {
		return scaleWorkflowEstimate(right, 1)
	}
	if right == nil {
		return scaleWorkflowEstimate(left, 1)
	}
	return &db.WorkflowTimeEstimate{
		P50Seconds: left.P50Seconds + right.P50Seconds,
		P90Seconds: left.P90Seconds + right.P90Seconds,
		SampleSize: min(left.SampleSize, right.SampleSize),
	}
}

func estimateWorkflowCost(request *workflowrun.Request) int {
	if request == nil {
		return 1
	}
	cost := len(request.Nodes)
	for _, scenario := range request.Scenarios {
		cost += 1 + len(scenario.Tests)
	}
	if cost < 1 {
		return 1
	}
	return cost
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
	request, secrets, err := runsecret.DecodeJobPayload(payload)
	if err != nil {
		s.failJob(ctx, owner, job, err)
		return
	}
	defer secrets.Destroy()
	ctx = runsecret.WithContext(ctx, secrets)
	bundle, err := request.Bundle()
	if err != nil {
		s.failJob(ctx, owner, job, err)
		return
	}

	if err := s.updateRun(ctx, request, "running", nil, nil, ""); err != nil {
		s.failJob(ctx, owner, job, fmt.Errorf("persist running workflow state: %w", err))
		return
	}
	s.emitLog(ctx, request, "Starting workflow run: "+request.WorkflowName, "running", nil, nil)

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
			scenarioSecrets, secretErr := secrets.ForScenario(scenario)
			if secretErr != nil {
				results[index] = dto.WorkflowBundleScenarioResponse{ScenarioName: scenario.Name, Success: false, Error: runsecret.RedactContext(ctx, secretErr.Error())}
				return
			}
			defer scenarioSecrets.Destroy()
			if checkpoint, ok := s.completedScenario(ctx, scenario); ok {
				results[index] = checkpoint
				s.emitLog(ctx, request, fmt.Sprintf("Restored completed scenario %q from its checkpoint", scenario.Name), mapScenarioStatusValue(checkpoint.Success), &scenario, errorValue(checkpoint.Error))
				return
			}
			if err := s.updateScenario(ctx, scenario, "running", "", "", nil); err != nil {
				results[index] = dto.WorkflowBundleScenarioResponse{ScenarioName: scenario.Name, Success: false, Error: "failed to persist running scenario state: " + err.Error(), Summary: dto.TestSummary{Total: len(scenario.Tests)}}
				return
			}
			s.emitLog(ctx, request, fmt.Sprintf("Running scenario %q", scenario.Name), "running", &scenario, nil)
			scenarioCtx := withWorkflowProgressReporter(ctx, func(activity executionevent.Activity) {
				if activity.Diagnostic != nil && activity.Diagnostic.ScenarioID == "" {
					copy := *activity.Diagnostic
					copy.ScenarioID = scenario.ID
					activity.Diagnostic = &copy
				}
				s.emitActivity(ctx, request, scenario, activity)
			})
			result := s.handler.runWorkflowBundleScenarioForRun(scenarioCtx, bundle, bundle.Scenarios[index], &dto.ExecutionContextDTO{
				SessionID: scenario.ScenarioRunID, ProjectID: firstNonEmpty(scenario.ProjectID, request.ProjectID),
				UserID: firstNonEmpty(scenario.UserID, request.UserID, "demo-user"), ClientID: firstNonEmpty(scenario.ClientID, request.ClientID),
				WorkflowID: request.WorkflowID, WorkflowRunID: request.WorkflowRunID,
				ScenarioID: scenario.ID, ScenarioName: scenario.Name,
			}, scenarioSecrets)
			attachScenarioToDiagnostics(&result, scenario.ID)
			results[index] = result
			if ctx.Err() != nil {
				return
			}
			status := "completed"
			if result.CleanupFailed {
				status = "cleanup_failed"
			} else if !result.Success {
				status = "failed"
			}
			if err := s.updateScenario(ctx, scenario, status, result.SessionID, result.Error, result); err != nil {
				result.Success = false
				if result.Error != "" {
					result.Error += "; "
				}
				result.Error += "failed to persist scenario state: " + err.Error()
				results[index] = result
			}
			s.emitTestResults(ctx, request, scenario, result)
			s.emitJourneyResult(ctx, request, scenario, result)
			s.emitLog(ctx, request, fmt.Sprintf("Scenario %q %s", scenario.Name, status), mapScenarioStatus(status), &scenario, errorValue(result.Error))
		}()
	}
	wg.Wait()
	if ctx.Err() != nil {
		if errors.Is(context.Cause(ctx), db.ErrWorkflowCancellationRequested) {
			if err := s.store.CancelWorkflowJob(context.WithoutCancel(ctx), job.ID, owner, time.Now().UTC()); err != nil {
				logger.Error("failed to finalize cancelled workflow job", "workflow_run_id", job.WorkflowRunID, "error", err)
			}
			return
		}
		if err := s.store.ReleaseWorkflowJob(context.WithoutCancel(ctx), job.ID, owner, time.Now().UTC()); err != nil {
			logger.Error("failed to release interrupted workflow job", "workflow_run_id", job.WorkflowRunID, "error", err)
		}
		return
	}

	summary := dto.WorkflowBundleRunSummary{TotalScenarios: len(results)}
	success := true
	cleanupFailed := false
	for _, result := range results {
		summary.TotalTests += result.Summary.Total
		summary.PassedTests += result.Summary.Passed
		summary.FailedTests += result.Summary.Failed
		summary.RetriedTests += result.Summary.Retried
		accumulateJourneySummary(&summary, result.Journey)
		if result.Success {
			summary.PassedScenarios++
		} else {
			summary.FailedScenarios++
			success = false
		}
		cleanupFailed = cleanupFailed || result.CleanupFailed
	}
	status := "completed"
	if cleanupFailed {
		status = "cleanup_failed"
	} else if !success && summary.PassedScenarios > 0 {
		status = "partial_failed"
	} else if !success {
		status = "failed"
	}
	resultPayload := map[string]any{
		"success": success, "status": status,
		"totalScenarios": summary.TotalScenarios, "passedScenarios": summary.PassedScenarios,
		"failedScenarios": summary.FailedScenarios, "totalTests": summary.TotalTests,
		"passedTests": summary.PassedTests, "failedTests": summary.FailedTests,
		"retriedTests":  summary.RetriedTests,
		"totalJourneys": summary.TotalJourneys, "passedJourneys": summary.PassedJourneys,
		"failedJourneys": summary.FailedJourneys, "interruptedJourneys": summary.InterruptedJourneys,
		"totalSteps": summary.TotalSteps, "passedSteps": summary.PassedSteps, "failedSteps": summary.FailedSteps,
		"skippedSteps": summary.SkippedSteps, "interruptedSteps": summary.InterruptedSteps,
		"scenarioResults": scenarioSnapshots(request.Scenarios, results),
		"diagnostics":     workflowDiagnostics(results),
	}
	logs := []string{fmt.Sprintf("Workflow run complete: %d/%d scenarios passed", summary.PassedScenarios, summary.TotalScenarios)}
	if err := s.updateRun(ctx, request, status, nil, resultPayload, workflowErrors(request.Scenarios, results)); err != nil {
		s.failJob(ctx, owner, job, fmt.Errorf("persist terminal workflow state: %w", err))
		return
	}
	s.emitLog(ctx, request, logs[len(logs)-1], mapWorkflowStatus(status), nil, resultPayload)
	if err := s.store.CompleteWorkflowJob(ctx, job.ID, owner, time.Now().UTC()); err != nil {
		logger.ErrorContext(ctx, "failed to complete workflow job", "error", err)
	}
}

func (s *WorkflowService) completedScenario(ctx context.Context, scenario workflowrun.Scenario) (dto.WorkflowBundleScenarioResponse, bool) {
	persisted, err := s.db.GetSession(ctx, scenario.ScenarioRunID)
	if err != nil || !isTerminalScenarioCheckpoint(persisted) {
		return dto.WorkflowBundleScenarioResponse{}, false
	}
	response := dto.WorkflowBundleScenarioResponse{
		ScenarioName: scenario.Name, SessionID: persisted.BackendSessionID,
		Success: persisted.Status == "completed", Error: persisted.Error,
		Summary: dto.TestSummary{Total: len(scenario.Tests)},
	}
	if persisted.Result != "" {
		var stored dto.WorkflowBundleScenarioResponse
		if json.Unmarshal([]byte(persisted.Result), &stored) == nil {
			response.Diagnostics = stored.Diagnostics
			response.Journey = stored.Journey
			if stored.Journey != nil {
				response.Success, response.Error, response.CleanupFailed = stored.Success, stored.Error, stored.CleanupFailed
				return response, true
			}
		}
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

func isTerminalScenarioCheckpoint(persisted *db.Session) bool {
	if persisted == nil {
		return false
	}
	return (persisted.Status == "completed" && persisted.Phase == sessionPhaseCompleted) ||
		(persisted.Status == "failed" && persisted.Phase == sessionPhaseFailed)
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
				if errors.Is(err, db.ErrWorkflowCancellationRequested) {
					logger.InfoContext(ctx, "workflow cancellation observed", "job_id", jobID)
					cancel(db.ErrWorkflowCancellationRequested)
					return
				}
				logger.ErrorContext(ctx, "workflow lease heartbeat failed; cancelling execution", "job_id", jobID, "error", err)
				cancel(fmt.Errorf("workflow lease heartbeat failed: %w", err))
				return
			}
		}
	}
}

func (s *WorkflowService) failJob(ctx context.Context, owner string, job *db.WorkflowJob, err error) {
	now := time.Now().UTC()
	safeError := runsecret.RedactContext(ctx, err.Error())
	_ = s.store.FailWorkflowJob(ctx, job.ID, owner, safeError, now)
	run, getErr := s.db.GetWorkflowRun(ctx, job.WorkflowRunID)
	if getErr == nil {
		run.Status, run.Error, run.UpdatedAt, run.CompletedAt, run.Version = "failed", safeError, now, &now, run.Version+1
		_ = s.db.UpsertWorkflowRun(ctx, run)
	}
	diagnostic := buildExecutionDiagnostic(executionevent.StageAggregation, apperrors.Wrap(err, apperrors.ErrInternal, "workflow worker failed"), "Tokyo Tester could not continue this workflow run.", "", "", "", nil)
	s.appendLogEvent(ctx, job.WorkflowRunID, job.ProjectID, "Workflow run failed: "+safeError, map[string]any{
		"workflowRunId": job.WorkflowRunID, "projectId": job.ProjectID,
		"message": "Workflow run failed: " + safeError, "status": "failed",
		"error": safeError, "timestamp": now.UnixMilli(), "sequence": now.UnixNano(),
		"stage": executionevent.StageAggregation, "kind": "diagnostic", "activityStatus": "failed", "diagnostic": diagnostic,
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
		"stage": executionevent.StageAggregation, "kind": "diagnostic", "activityStatus": "failed",
		"diagnostic": buildExecutionDiagnostic(executionevent.StageAggregation, apperrors.New(apperrors.ErrInternal, job.LastError), "Tokyo Tester could not recover this workflow run after repeated interruptions.", "", "", "", nil),
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
		encodedLogs, err := marshalRunOutput(ctx, logs)
		if err != nil {
			return err
		}
		run.Logs = string(encodedLogs)
	}
	if result != nil {
		encoded, _ := marshalRunOutput(ctx, result)
		run.Summary = string(encoded)
	}
	if message != "" {
		run.Error = runsecret.RedactContext(ctx, message)
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

func (s *WorkflowService) updateScenario(ctx context.Context, scenario workflowrun.Scenario, status, backendID, message string, result any) error {
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
		run.Error = runsecret.RedactContext(ctx, message)
	}
	if result != nil {
		encoded, _ := marshalRunOutput(ctx, result)
		run.Result = string(encoded)
	}
	if run.StartedAt == nil {
		run.StartedAt = &now
	}
	if status == "completed" || status == "failed" || status == "cleanup_failed" {
		run.CompletedAt = &now
		if status == "completed" {
			run.Phase = sessionPhaseCompleted
		} else if status == "cleanup_failed" {
			run.Phase = sessionPhaseCleanupFailed
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
	message = boundedWorkflowLogMessage(runsecret.RedactContext(ctx, message))
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
	encoded, err := marshalRunOutput(ctx, payload)
	if err != nil {
		logger.ErrorContext(ctx, "failed to encode workflow log event", "error", err)
		return
	}
	if _, err := s.store.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: request.WorkflowRunID, EventType: "workflowlog", Payload: string(encoded), CreatedAt: now}, message, scenarioRunID); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow log event", "workflow_run_id", request.WorkflowRunID, "error", err)
	}
}

func (s *WorkflowService) emitActivity(ctx context.Context, request *workflowrun.Request, scenario workflowrun.Scenario, activity executionevent.Activity) {
	message := boundedWorkflowLogMessage(runsecret.RedactContext(ctx, activity.Message))
	now := time.Now().UTC()
	payload := map[string]any{
		"workflowRunId": request.WorkflowRunID, "projectId": request.ProjectID,
		"workflowId": request.WorkflowID, "scenarioId": scenario.ID,
		"scenarioName": scenario.Name, "message": message, "status": "running",
		"stage": activity.Stage, "kind": activity.Kind, "activityStatus": activity.Status,
		"timestamp": now.UnixMilli(), "sequence": now.UnixNano(),
	}
	if activity.ServiceName != "" {
		payload["serviceName"] = activity.ServiceName
	}
	if activity.ServiceID != "" {
		payload["serviceId"] = activity.ServiceID
	}
	if len(activity.ServiceNames) > 0 {
		payload["serviceNames"] = activity.ServiceNames
	}
	if activity.TestID != "" {
		payload["testId"] = activity.TestID
	}
	if activity.TestName != "" {
		payload["testName"] = activity.TestName
	}
	if activity.StepID != "" {
		payload["stepId"] = activity.StepID
		payload["stepSequence"] = activity.Sequence
	}
	if activity.StepName != "" {
		payload["stepName"] = activity.StepName
	}
	if activity.StepKind != "" {
		payload["stepKind"] = activity.StepKind
	}
	if activity.Operation != "" {
		payload["operation"] = activity.Operation
	}
	if activity.Attempt > 0 {
		payload["attempt"] = activity.Attempt
	}
	if activity.MaxAttempts > 0 {
		payload["maxAttempts"] = activity.MaxAttempts
	}
	if activity.RetryReason != "" {
		payload["retryReason"] = activity.RetryReason
	}
	if activity.Diagnostic != nil {
		payload["diagnostic"] = activity.Diagnostic
	}
	encoded, err := marshalRunOutput(ctx, payload)
	if err != nil {
		logger.ErrorContext(ctx, "failed to encode workflow activity event", "error", err)
		return
	}
	if _, err := s.store.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: request.WorkflowRunID, EventType: "workflowlog", Payload: string(encoded), CreatedAt: now}, message, scenario.ScenarioRunID); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow activity event", "workflow_run_id", request.WorkflowRunID, "error", err)
	}
}

func boundedWorkflowLogMessage(message string) string {
	const maxWorkflowLogBytes = 16 << 10
	if len(message) <= maxWorkflowLogBytes {
		return message
	}
	return strings.ToValidUTF8(message[:maxWorkflowLogBytes], "�") + "… [truncated]"
}

func (s *WorkflowService) emitTestResults(ctx context.Context, request *workflowrun.Request, scenario workflowrun.Scenario, response dto.WorkflowBundleScenarioResponse) {
	results := make([]map[string]any, 0, len(response.Results))
	now := time.Now().UTC()
	for index, result := range response.Results {
		status := "failed"
		if result.Passed {
			status = "passed"
		}
		results = append(results, map[string]any{"testResultId": request.WorkflowRunID + "_" + scenario.ID + "_" + result.Name, "testName": result.Name, "testType": result.Type, "status": status, "resultData": result, "durationMs": result.DurationMs, "executedAt": now.Format(time.RFC3339Nano), "action": "update", "containerLogs": result.ContainerLogs, "diagnostic": result.Diagnostic, "sequence": index})
	}
	s.appendEvent(ctx, request.WorkflowRunID, "testresult", map[string]any{"workflowRunId": request.WorkflowRunID, "projectId": request.ProjectID, "workflowId": request.WorkflowID, "scenarioId": scenario.ID, "scenarioName": scenario.Name, "backendSessionId": response.SessionID, "bulkId": uuid.NewString(), "timestamp": now.UnixMilli(), "results": results})
}

func (s *WorkflowService) emitJourneyResult(ctx context.Context, request *workflowrun.Request, scenario workflowrun.Scenario, response dto.WorkflowBundleScenarioResponse) {
	if response.Journey == nil {
		return
	}
	s.appendEvent(ctx, request.WorkflowRunID, "journeyresult", map[string]any{"workflowRunId": request.WorkflowRunID, "projectId": request.ProjectID, "workflowId": request.WorkflowID, "scenarioId": scenario.ID, "scenarioName": scenario.Name, "backendSessionId": response.SessionID, "timestamp": time.Now().UTC().UnixMilli(), "journey": response.Journey})
}

func (s *WorkflowService) appendEvent(ctx context.Context, runID, eventType string, payload any) {
	encoded, err := marshalRunOutput(ctx, payload)
	if err != nil {
		return
	}
	if _, err := s.store.AppendWorkflowRunEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: runID, EventType: eventType, Payload: string(encoded), CreatedAt: time.Now().UTC()}); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow event", "workflow_run_id", runID, "event_type", eventType, "error", err)
	}
}

func (s *WorkflowService) appendLogEvent(ctx context.Context, runID, projectID, message string, payload any) {
	message = boundedWorkflowLogMessage(runsecret.RedactContext(ctx, message))
	encoded, err := marshalRunOutput(ctx, payload)
	if err != nil {
		logger.ErrorContext(ctx, "failed to encode workflow log event", "workflow_run_id", runID, "error", err)
		return
	}
	if _, err := s.store.AppendWorkflowLogEvent(ctx, &db.WorkflowRunEvent{WorkflowRunID: runID, EventType: "workflowlog", Payload: string(encoded), CreatedAt: time.Now().UTC()}, message, ""); err != nil {
		logger.ErrorContext(ctx, "failed to persist workflow failure event", "workflow_run_id", runID, "project_id", projectID, "error", err)
	}
}

func marshalRunOutput(ctx context.Context, value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	redacted := runsecret.RedactContext(ctx, string(encoded))
	if redacted == string(encoded) {
		return encoded, nil
	}
	clear(encoded)
	return []byte(redacted), nil
}

func (s *WorkflowService) pruneEvents(ctx context.Context) {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for {
		_ = s.store.DeleteWorkflowRunEventsBefore(ctx, time.Now().UTC().AddDate(0, 0, -s.config.EventRetentionDays))
		if s.handler.browserArtifacts != nil {
			if err := s.handler.browserArtifacts.PruneExpired(ctx, time.Now().UTC()); err != nil {
				logger.ErrorContext(ctx, "failed to prune expired browser artifacts", "error", err)
			}
		}
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
		status := mapScenarioStatusValue(results[i].Success)
		if results[i].CleanupFailed {
			status = "cleanup_failed"
		}
		values[i] = map[string]any{"scenarioId": scenarios[i].ID, "scenarioName": scenarios[i].Name, "backendSessionId": results[i].SessionID, "success": results[i].Success, "status": status, "error": results[i].Error, "diagnostics": results[i].Diagnostics, "journey": results[i].Journey}
	}
	return values
}

func workflowDiagnostics(results []dto.WorkflowBundleScenarioResponse) []executionevent.Diagnostic {
	diagnostics := make([]executionevent.Diagnostic, 0)
	for _, result := range results {
		diagnostics = append(diagnostics, result.Diagnostics...)
		for _, testResult := range result.Results {
			if testResult.Diagnostic != nil {
				diagnostics = append(diagnostics, *testResult.Diagnostic)
			}
		}
	}
	return diagnostics
}

func attachScenarioToDiagnostics(result *dto.WorkflowBundleScenarioResponse, scenarioID string) {
	if result == nil || scenarioID == "" {
		return
	}
	for index := range result.Diagnostics {
		if result.Diagnostics[index].ScenarioID == "" {
			result.Diagnostics[index].ScenarioID = scenarioID
		}
	}
	for index := range result.Results {
		if result.Results[index].Diagnostic != nil && result.Results[index].Diagnostic.ScenarioID == "" {
			result.Results[index].Diagnostic.ScenarioID = scenarioID
		}
	}
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
	if status == "cleanup_failed" {
		return "cleanup_failed"
	}
	if status == "completed" {
		return "completed"
	}
	return "failed"
}
func mapWorkflowStatus(status string) string {
	if status == "cleanup_failed" {
		return "cleanup_failed"
	}
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
