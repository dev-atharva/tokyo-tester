package api

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/db"
	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/session"
	"github.com/dev-atharva/cots/pkg/test"
	"github.com/dev-atharva/cots/pkg/types"
)

const (
	sessionPhaseCreated      = "created"
	sessionPhaseProvisioning = "provisioning"
	sessionPhaseProvisioned  = "provisioned"
	sessionPhaseRunningTests = "running_tests"
	sessionPhaseTestsDone    = "tests_completed"
	sessionPhaseCleaningUp   = "cleaning_up"
	sessionPhaseCompleted    = "completed"
	sessionPhaseFailed       = "failed"
)

type persistedTestResult struct {
	Name              string            `json:"name"`
	Type              string            `json:"type"`
	Passed            bool              `json:"passed"`
	Error             string            `json:"error,omitempty"`
	ContainerLogs     map[string]string `json:"container_logs,omitempty"`
	InterpolationData any               `json:"interpolation_data,omitempty"`
}

func runtimeOwnerID() string {
	hostname, err := os.Hostname()
	if err != nil || hostname == "" {
		hostname = "unknown-host"
	}
	return fmt.Sprintf("%s:%d", hostname, os.Getpid())
}

func (h *Handler) ensureSessionLease(ctx context.Context, persisted *db.Session) (*db.Session, error) {
	if h.db == nil || persisted == nil {
		return persisted, nil
	}

	now := time.Now().UTC()
	if persisted.OwnerID != "" && persisted.OwnerID != h.ownerID && persisted.LeaseExpiresAt != nil && persisted.LeaseExpiresAt.After(now) {
		return nil, fmt.Errorf("session is currently leased by %s until %s", persisted.OwnerID, persisted.LeaseExpiresAt.Format(time.RFC3339))
	}

	leaseUntil := now.Add(h.leaseDuration)
	updated, err := h.updatePersistedSession(ctx, persisted.ID, func(current *db.Session) error {
		if current.OwnerID != "" && current.OwnerID != h.ownerID && current.LeaseExpiresAt != nil && current.LeaseExpiresAt.After(now) {
			return fmt.Errorf("session is currently leased by %s until %s", current.OwnerID, current.LeaseExpiresAt.Format(time.RFC3339))
		}
		current.OwnerID = h.ownerID
		current.HeartbeatAt = &now
		current.LeaseExpiresAt = &leaseUntil
		if current.Phase == "" {
			current.Phase = sessionPhaseCreated
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (h *Handler) releaseSessionLease(ctx context.Context, persistedID string) {
	if h.db == nil || persistedID == "" {
		return
	}
	_, err := h.updatePersistedSession(ctx, persistedID, func(current *db.Session) error {
		now := time.Now().UTC()
		current.OwnerID = ""
		current.HeartbeatAt = &now
		current.LeaseExpiresAt = nil
		return nil
	})
	if err != nil {
		logger.WarnContext(ctx, "failed to release session lease", "session_id", persistedID, "error", err)
	}
}

func (h *Handler) updatePersistedSession(ctx context.Context, sessionID string, mutate func(*db.Session) error) (*db.Session, error) {
	if h.db == nil || sessionID == "" {
		return nil, nil
	}

	for attempt := 0; attempt < 3; attempt++ {
		current, err := h.db.GetSession(ctx, sessionID)
		if err != nil {
			return nil, err
		}

		next := *current
		if err := mutate(&next); err != nil {
			return nil, err
		}
		next.Version = current.Version + 1
		next.UpdatedAt = time.Now().UTC()

		if err := h.db.UpsertSession(ctx, &next); err != nil {
			if stringsContains(err.Error(), "version conflict") {
				continue
			}
			return nil, err
		}
		return &next, nil
	}

	return nil, fmt.Errorf("failed to update session %s due to repeated version conflicts", sessionID)
}

func stringsContains(s string, substr string) bool {
	return len(substr) == 0 || (len(s) >= len(substr) && (func() bool { return contains(s, substr) })())
}

func contains(s string, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}

func (h *Handler) resolvePersistedSession(ctx context.Context, backendSessionID string, execution *dto.ExecutionContextDTO) (*db.Session, error) {
	if h.db == nil {
		return nil, nil
	}

	if backendSessionID != "" {
		if sess, err := h.db.GetSessionByBackendSessionID(ctx, backendSessionID); err == nil {
			return sess, nil
		}
	}

	if execution != nil {
		if execution.SessionID != "" {
			if sess, err := h.db.GetSession(ctx, execution.SessionID); err == nil {
				return sess, nil
			}
		}
		if execution.WorkflowRunID != "" && execution.ScenarioID != "" {
			if sess, err := h.db.FindSessionByExecution(ctx, execution.WorkflowRunID, execution.ScenarioID); err == nil {
				return sess, nil
			}
		}
	}

	return nil, nil
}

func (h *Handler) buildPersistedSession(ctx context.Context, backendSessionID string, execution *dto.ExecutionContextDTO, services []config.ServiceConfig) (*db.Session, error) {
	if h.db == nil || execution == nil {
		return nil, nil
	}

	serviceGraphJSON, err := json.Marshal(services)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal service graph: %w", err)
	}

	now := time.Now().UTC()
	leaseUntil := now.Add(h.leaseDuration)
	persisted, err := h.resolvePersistedSession(ctx, backendSessionID, execution)
	if err != nil {
		return nil, err
	}

	if persisted == nil {
		persistedID := execution.SessionID
		if persistedID == "" {
			persistedID = backendSessionID
		}
		persisted = &db.Session{
			ID:               persistedID,
			ProjectID:        execution.ProjectID,
			WorkflowRunID:    execution.WorkflowRunID,
			WorkflowID:       execution.WorkflowID,
			ScenarioID:       execution.ScenarioID,
			ScenarioName:     execution.ScenarioName,
			BackendSessionID: backendSessionID,
			Status:           "running",
			StartedAt:        &now,
			OwnerID:          h.ownerID,
			LeaseExpiresAt:   &leaseUntil,
			HeartbeatAt:      &now,
			Phase:            sessionPhaseProvisioning,
			CheckpointIndex:  0,
			ServiceGraph:     string(serviceGraphJSON),
			Version:          1,
			CreatedAt:        now,
			UpdatedAt:        now,
			ClientID:         execution.ClientID,
			UserID:           execution.UserID,
		}
		return persisted, h.db.UpsertSession(ctx, persisted)
	}

	updated, err := h.updatePersistedSession(ctx, persisted.ID, func(current *db.Session) error {
		current.ProjectID = firstNonEmpty(current.ProjectID, execution.ProjectID)
		current.WorkflowRunID = firstNonEmpty(current.WorkflowRunID, execution.WorkflowRunID)
		current.WorkflowID = firstNonEmpty(current.WorkflowID, execution.WorkflowID)
		current.ScenarioID = firstNonEmpty(current.ScenarioID, execution.ScenarioID)
		current.ScenarioName = firstNonEmpty(current.ScenarioName, execution.ScenarioName)
		current.ClientID = firstNonEmpty(current.ClientID, execution.ClientID)
		current.UserID = firstNonEmpty(current.UserID, execution.UserID)
		current.BackendSessionID = backendSessionID
		current.Status = "running"
		if current.StartedAt == nil {
			current.StartedAt = &now
		}
		current.OwnerID = h.ownerID
		current.LeaseExpiresAt = &leaseUntil
		current.HeartbeatAt = &now
		current.Phase = sessionPhaseProvisioning
		current.ServiceGraph = string(serviceGraphJSON)
		if current.CheckpointIndex < 0 {
			current.CheckpointIndex = 0
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return updated, nil
}

func (h *Handler) persistProvisionedState(ctx context.Context, persistedID string, orch *orchestrator.Orchestrator) {
	if h.db == nil || persistedID == "" || orch == nil {
		return
	}

	containerIDs, _ := json.Marshal(orch.ContainerIDs())
	runtimeSnapshot, _ := json.Marshal(orch.RuntimeSnapshot())
	_, err := h.updatePersistedSession(ctx, persistedID, func(current *db.Session) error {
		now := time.Now().UTC()
		current.Status = "running"
		current.Phase = sessionPhaseProvisioned
		current.ContainerIDs = string(containerIDs)
		current.RuntimeSnapshot = string(runtimeSnapshot)
		current.HeartbeatAt = &now
		leaseUntil := now.Add(h.leaseDuration)
		current.LeaseExpiresAt = &leaseUntil
		return nil
	})
	if err != nil {
		logger.WarnContext(ctx, "failed to persist provisioned session state", "session_id", persistedID, "error", err)
	}
}

func (h *Handler) persistSessionFailure(ctx context.Context, persistedID string, err error, phase string) {
	if h.db == nil || persistedID == "" {
		return
	}
	_, updateErr := h.updatePersistedSession(ctx, persistedID, func(current *db.Session) error {
		now := time.Now().UTC()
		current.Status = "failed"
		current.Phase = phase
		current.Error = err.Error()
		current.CompletedAt = &now
		current.HeartbeatAt = &now
		return nil
	})
	if updateErr != nil {
		logger.WarnContext(ctx, "failed to persist failed session state", "session_id", persistedID, "error", updateErr)
	}
}

func (h *Handler) ensureTestPlan(ctx context.Context, persistedID string, tests []config.TestConfig) error {
	if h.db == nil || persistedID == "" {
		return nil
	}
	testPlanJSON, err := json.Marshal(tests)
	if err != nil {
		return err
	}
	_, err = h.updatePersistedSession(ctx, persistedID, func(current *db.Session) error {
		now := time.Now().UTC()
		current.TestPlan = string(testPlanJSON)
		current.Phase = sessionPhaseRunningTests
		current.HeartbeatAt = &now
		leaseUntil := now.Add(h.leaseDuration)
		current.LeaseExpiresAt = &leaseUntil
		return nil
	})
	return err
}

func (h *Handler) loadPersistedResults(ctx context.Context, persisted *db.Session, orderedTests []config.TestConfig, active *session.Session) ([]dto.TestResult, map[string]dto.TestResult, error) {
	if h.db == nil || persisted == nil {
		return nil, map[string]dto.TestResult{}, nil
	}
	rows, err := h.db.ListTestResults(ctx, persisted.ID)
	if err != nil {
		return nil, nil, err
	}

	byName := make(map[string]dto.TestResult, len(rows))
	for _, row := range rows {
		if row == nil || row.IsDeleted {
			continue
		}
		var stored persistedTestResult
		if row.ResultData != "" {
			_ = json.Unmarshal([]byte(row.ResultData), &stored)
		}
		result := dto.TestResult{
			Name:          firstNonEmpty(stored.Name, row.TestName),
			Type:          firstNonEmpty(stored.Type, row.TestType),
			Passed:        row.Status == "passed",
			Error:         stored.Error,
			ContainerLogs: stored.ContainerLogs,
		}
		byName[row.TestName] = result
		if active != nil {
			interpolation := stored.InterpolationData
			if interpolation == nil {
				interpolation = map[string]any{
					"status": row.Status,
					"name":   row.TestName,
					"type":   row.TestType,
				}
			}
			active.StoreTestResult(row.TestName, interpolation)
		}
	}

	results := make([]dto.TestResult, 0, len(orderedTests))
	for _, testCfg := range orderedTests {
		if existing, ok := byName[testCfg.Name]; ok {
			results = append(results, existing)
		}
	}
	return results, byName, nil
}

func (h *Handler) persistTestResult(ctx context.Context, persisted *db.Session, result dto.TestResult, interpolationData any, executedAt time.Time) error {
	if h.db == nil || persisted == nil {
		return nil
	}
	resultPayload, err := json.Marshal(persistedTestResult{
		Name:              result.Name,
		Type:              result.Type,
		Passed:            result.Passed,
		Error:             result.Error,
		ContainerLogs:     result.ContainerLogs,
		InterpolationData: interpolationData,
	})
	if err != nil {
		return err
	}

	status := "failed"
	if result.Passed {
		status = "passed"
	}

	testID := persisted.ID + "_" + result.Name
	if persisted.WorkflowRunID != "" && persisted.ScenarioID != "" {
		testID = fmt.Sprintf("%s_%s_%s", persisted.WorkflowRunID, persisted.ScenarioID, result.Name)
	}

	record := &db.TestResult{
		ID:            testID,
		ProjectID:     persisted.ProjectID,
		SessionID:     persisted.ID,
		WorkflowRunID: persisted.WorkflowRunID,
		WorkflowID:    persisted.WorkflowID,
		ScenarioID:    persisted.ScenarioID,
		ScenarioName:  persisted.ScenarioName,
		TestName:      result.Name,
		TestType:      result.Type,
		Status:        status,
		ResultData:    string(resultPayload),
		ExecutedAt:    executedAt.UTC(),
		CreatedAt:     executedAt.UTC(),
		UpdatedAt:     executedAt.UTC(),
		ClientID:      persisted.ClientID,
		UserID:        persisted.UserID,
	}
	return h.db.UpsertTestResult(ctx, record)
}

func (h *Handler) persistCheckpoint(ctx context.Context, persistedID string, checkpointIndex int, phase string, finalStatus string, finalSummary map[string]any) error {
	if h.db == nil || persistedID == "" {
		return nil
	}

	returnValue, err := json.Marshal(finalSummary)
	if err != nil && finalSummary != nil {
		return err
	}

	_, err = h.updatePersistedSession(ctx, persistedID, func(current *db.Session) error {
		now := time.Now().UTC()
		current.CheckpointIndex = checkpointIndex
		current.Phase = phase
		current.HeartbeatAt = &now
		leaseUntil := now.Add(h.leaseDuration)
		current.LeaseExpiresAt = &leaseUntil
		if finalStatus != "" {
			current.Status = finalStatus
			current.CompletedAt = &now
		}
		if finalSummary != nil {
			current.Result = string(returnValue)
		}
		return nil
	})
	return err
}

func (h *Handler) getOrRecoverSession(ctx context.Context, backendSessionID string, execution *dto.ExecutionContextDTO) (*session.Session, *db.Session, error) {
		if active, err := h.sessionManager.Get(backendSessionID); err == nil {
			if active.PersistedID != "" && h.db != nil {
				persisted, err := h.db.GetSession(ctx, active.PersistedID)
				if err == nil {
					persisted, err = h.ensureSessionLease(ctx, persisted)
					return active, persisted, err
			}
		}
		return active, nil, nil
	}

	persisted, err := h.resolvePersistedSession(ctx, backendSessionID, execution)
	if err != nil {
		return nil, nil, err
	}
	if persisted == nil {
		return nil, nil, fmt.Errorf("session not found")
	}

	persisted, err = h.ensureSessionLease(ctx, persisted)
	if err != nil {
		return nil, nil, err
	}
	if persisted.ServiceGraph == "" {
		return nil, persisted, fmt.Errorf("session cannot be recovered because no persisted service graph exists")
	}

	var services []config.ServiceConfig
	if err := json.Unmarshal([]byte(persisted.ServiceGraph), &services); err != nil {
		return nil, persisted, fmt.Errorf("failed to decode persisted service graph: %w", err)
	}

	orch := orchestrator.NewOrchestrator(h.providers)
	execCtx := toSessionExecutionContext(executionContextFromPersisted(persisted, execution))
	h.sessionManager.Register(backendSessionID, orch, execCtx)

	active, err := h.sessionManager.Get(backendSessionID)
	if err != nil {
		return nil, persisted, err
	}
	active.PersistedID = persisted.ID

	if err := orch.ProvisionServices(logger.WithContext(active.Context, logger.FromContext(ctx)), services); err != nil {
		h.persistSessionFailure(ctx, persisted.ID, err, sessionPhaseFailed)
		return nil, persisted, fmt.Errorf("failed to reprovision services for recovered session: %w", err)
	}
	h.persistProvisionedState(ctx, persisted.ID, orch)
	return active, persisted, nil
}

func executionContextFromPersisted(persisted *db.Session, fallback *dto.ExecutionContextDTO) *dto.ExecutionContextDTO {
	ctx := &dto.ExecutionContextDTO{}
	if fallback != nil {
		*ctx = *fallback
	}
	if persisted == nil {
		return ctx
	}
	ctx.SessionID = firstNonEmpty(ctx.SessionID, persisted.ID)
	ctx.ProjectID = firstNonEmpty(ctx.ProjectID, persisted.ProjectID)
	ctx.UserID = firstNonEmpty(ctx.UserID, persisted.UserID)
	ctx.ClientID = firstNonEmpty(ctx.ClientID, persisted.ClientID)
	ctx.WorkflowID = firstNonEmpty(ctx.WorkflowID, persisted.WorkflowID)
	ctx.WorkflowRunID = firstNonEmpty(ctx.WorkflowRunID, persisted.WorkflowRunID)
	ctx.ScenarioID = firstNonEmpty(ctx.ScenarioID, persisted.ScenarioID)
	ctx.ScenarioName = firstNonEmpty(ctx.ScenarioName, persisted.ScenarioName)
	return ctx
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func summarizeResults(results []dto.TestResult) map[string]any {
	summary := map[string]any{
		"total":  len(results),
		"passed": 0,
		"failed": 0,
	}
	for _, result := range results {
		if result.Passed {
			summary["passed"] = summary["passed"].(int) + 1
		} else {
			summary["failed"] = summary["failed"].(int) + 1
		}
	}
	return summary
}

func stableOrderedTests(tests []config.TestConfig) []config.TestConfig {
	ordered := append([]config.TestConfig(nil), tests...)
	sort.SliceStable(ordered, func(i, j int) bool {
		return ordered[i].Name < ordered[j].Name
	})
	return ordered
}

func interpolationPayloadForResult(result dto.TestResult) any {
	status := "failed"
	if result.Passed {
		status = "passed"
	}
	return map[string]any{
		"status": status,
		"name":   result.Name,
		"type":   result.Type,
	}
}

func replaySafeTest(testCfg config.TestConfig) bool {
	switch testCfg.Type {
	case "http", "database", "delay":
		return true
	case "cache":
		op := fmt.Sprintf("%v", testCfg.Config["operation"])
		return op == "get" || op == "exists" || op == "ping"
	case "queue":
		op := fmt.Sprintf("%v", testCfg.Config["operation"])
		return op == "consume" || op == "check_topic" || op == "list_topics"
	default:
		return false
	}
}

func loadPersistedTestPlan(raw string) ([]config.TestConfig, error) {
	if raw == "" {
		return nil, nil
	}
	var tests []config.TestConfig
	if err := json.Unmarshal([]byte(raw), &tests); err != nil {
		return nil, err
	}
	return tests, nil
}

func runtimeSnapshotFromJSON(raw string) (map[string]*types.ServiceRuntime, error) {
	if raw == "" {
		return map[string]*types.ServiceRuntime{}, nil
	}
	var snapshot map[string]*types.ServiceRuntime
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return nil, err
	}
	return snapshot, nil
}

func hydrateSessionResultsFromRuntimeSnapshot(sess *session.Session, snapshot map[string]*types.ServiceRuntime) {
	if sess == nil || sess.Orchestrator == nil {
		return
	}
	for _, runtime := range snapshot {
		if runtime == nil {
			continue
		}
		sess.Orchestrator.GetRegistry().Regsiter(runtime)
	}
}

func rejectUnsafeResume(tests []config.TestConfig, checkpointIndex int) error {
	if checkpointIndex <= 0 {
		return nil
	}
	for idx := checkpointIndex; idx < len(tests); idx++ {
		if !replaySafeTest(tests[idx]) {
			return fmt.Errorf("automatic resume blocked because test %q is not replay-safe on a re-provisioned environment", tests[idx].Name)
		}
	}
	return nil
}

func mergePersistedPlan(requested []config.TestConfig, persistedRaw string) ([]config.TestConfig, error) {
	if len(requested) > 0 {
		return requested, nil
	}
	return loadPersistedTestPlan(persistedRaw)
}

func asPersistedInterpolationData(result dto.TestResult) any {
	return interpolationPayloadForResult(result)
}

var _ = test.InterpolateTestConfig
