package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/dev-atharva/cots/pkg/db"
	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/workflowrun"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func (h *Handler) SubmitWorkflowRun(w http.ResponseWriter, r *http.Request) {
	if h.workflowService == nil {
		apperrors.RespondInternalError(w, "workflow worker is not enabled")
		return
	}
	var request workflowrun.Request
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 10<<20))
	if err := decoder.Decode(&request); err != nil {
		apperrors.ResponseBadRequest(w, "invalid workflow run request")
		return
	}
	job, created, err := h.workflowService.Submit(r.Context(), &request)
	if err != nil {
		if strings.Contains(err.Error(), "different payload") {
			respondJson(w, http.StatusConflict, map[string]string{"error": err.Error(), "code": apperrors.ErrInvalidRequest.String()})
			return
		}
		apperrors.ResponseBadRequest(w, err.Error())
		return
	}
	respondJson(w, http.StatusAccepted, map[string]any{
		"workflowRunId":      request.WorkflowRunID,
		"workflowRevisionId": request.WorkflowRevisionID,
		"status":             job.Status,
		"created":            created,
	})
}

func (h *Handler) ListWorkflowRevisions(w http.ResponseWriter, r *http.Request) {
	store, ok := h.db.(db.WorkflowRevisionStore)
	if !ok {
		apperrors.RespondInternalError(w, "workflow revisions are not enabled")
		return
	}
	projectID, workflowID := r.URL.Query().Get("projectId"), chi.URLParam(r, "workflowID")
	if projectID == "" {
		apperrors.ResponseBadRequest(w, "projectId is required")
		return
	}
	workflow, err := h.db.GetWorkflow(r.Context(), workflowID)
	if err != nil || workflow.ProjectID != projectID {
		apperrors.RespondNotFound(w, "workflow")
		return
	}
	revisions, err := store.ListWorkflowRevisions(r.Context(), projectID, workflowID)
	if err != nil {
		apperrors.RespondInternalError(w, "failed to list workflow revisions")
		return
	}
	respondJson(w, http.StatusOK, map[string]any{"revisions": revisions})
}

func (h *Handler) CreateWorkflowRevision(w http.ResponseWriter, r *http.Request) {
	store, ok := h.db.(db.WorkflowRevisionStore)
	if !ok {
		apperrors.RespondInternalError(w, "workflow revisions are not enabled")
		return
	}
	var input struct {
		ProjectID string `json:"projectId"`
		Message   string `json:"message"`
		UserID    string `json:"userId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil || input.ProjectID == "" {
		apperrors.ResponseBadRequest(w, "projectId is required")
		return
	}
	workflowID := chi.URLParam(r, "workflowID")
	revision, err := h.checkpointWorkflow(r.Context(), store, input.ProjectID, workflowID, input.Message, input.UserID)
	if err != nil {
		apperrors.ResponseBadRequest(w, err.Error())
		return
	}
	respondJson(w, http.StatusCreated, revision)
}

func (h *Handler) checkpointWorkflow(ctx context.Context, store db.WorkflowRevisionStore, projectID, workflowID, message, userID string) (*db.WorkflowRevision, error) {
	tx, err := h.db.BeginTx(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	workflow, err := tx.GetWorkflow(ctx, workflowID)
	if err != nil || workflow.ProjectID != projectID {
		return nil, fmt.Errorf("workflow not found")
	}
	scenarios, err := tx.ListScenariosByWorkflow(ctx, workflowID)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	snapshot, err := json.Marshal(db.WorkflowSnapshot{Workflow: workflow, Scenarios: scenarios})
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(message) == "" {
		message = "Manual checkpoint"
	}
	revision := &db.WorkflowRevision{ID: uuid.NewString(), ProjectID: projectID, WorkflowID: workflowID,
		WorkflowVersion: workflow.Version, Snapshot: string(snapshot), Message: message, CreatedBy: userID, CreatedAt: time.Now().UTC()}
	if err := store.CreateWorkflowRevision(ctx, revision); err != nil {
		return nil, err
	}
	return revision, nil
}

func (h *Handler) RestoreWorkflowRevision(w http.ResponseWriter, r *http.Request) {
	store, ok := h.db.(db.WorkflowRevisionStore)
	if !ok {
		apperrors.RespondInternalError(w, "workflow revisions are not enabled")
		return
	}
	var input struct {
		ProjectID       string `json:"projectId"`
		ExpectedVersion int    `json:"expectedVersion"`
		UserID          string `json:"userId"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10)).Decode(&input); err != nil || input.ProjectID == "" || input.ExpectedVersion < 1 {
		apperrors.ResponseBadRequest(w, "projectId and expectedVersion are required")
		return
	}
	workflowID, revisionID := chi.URLParam(r, "workflowID"), chi.URLParam(r, "revisionID")
	revision, err := store.GetWorkflowRevision(r.Context(), input.ProjectID, workflowID, revisionID)
	if err != nil {
		apperrors.RespondNotFound(w, "workflow revision")
		return
	}
	var snapshot db.WorkflowSnapshot
	if err := json.Unmarshal([]byte(revision.Snapshot), &snapshot); err != nil || snapshot.Workflow == nil {
		apperrors.RespondInternalError(w, "invalid workflow revision")
		return
	}
	tx, err := h.db.BeginTx(r.Context())
	if err != nil {
		apperrors.RespondInternalError(w, "failed to start restore")
		return
	}
	defer tx.Rollback()
	currentScenarios, err := tx.ListScenariosByWorkflow(r.Context(), workflowID)
	if err != nil {
		apperrors.RespondInternalError(w, "failed to load current scenarios")
		return
	}
	now := time.Now().UTC()
	restored := *snapshot.Workflow
	restored.ID, restored.ProjectID, restored.Version, restored.UpdatedAt, restored.UserID = workflowID, input.ProjectID, input.ExpectedVersion+1, now, input.UserID
	updated, err := tx.UpdateWorkflowIfVersion(r.Context(), &restored, input.ExpectedVersion)
	if err != nil {
		apperrors.RespondInternalError(w, "failed to restore workflow")
		return
	}
	if !updated {
		respondJson(w, http.StatusConflict, map[string]any{"error": "workflow changed before it could be restored", "code": "version_conflict"})
		return
	}
	snapshotScenarioIDs := make(map[string]struct{}, len(snapshot.Scenarios))
	for _, scenario := range snapshot.Scenarios {
		snapshotScenarioIDs[scenario.ID] = struct{}{}
	}
	for _, scenario := range currentScenarios {
		if _, exists := snapshotScenarioIDs[scenario.ID]; exists {
			continue
		}
		deleted, err := tx.DeleteScenarioIfVersion(r.Context(), scenario.ID, scenario.Version)
		if err != nil {
			apperrors.RespondInternalError(w, "failed to restore scenarios")
			return
		}
		if !deleted {
			respondJson(w, http.StatusConflict, map[string]any{"error": "a scenario changed before the workflow could be restored", "code": "version_conflict"})
			return
		}
	}
	for _, scenario := range snapshot.Scenarios {
		scenario.ProjectID, scenario.WorkflowID, scenario.UpdatedAt, scenario.UserID = input.ProjectID, workflowID, now, input.UserID
		current, getErr := tx.GetScenario(r.Context(), scenario.ID)
		if getErr != nil {
			scenario.Version, scenario.CreatedAt = 1, now
			if err := tx.UpsertScenario(r.Context(), scenario); err != nil {
				apperrors.RespondInternalError(w, "failed to restore scenarios")
				return
			}
			continue
		}
		scenario.Version, scenario.CreatedAt = current.Version+1, current.CreatedAt
		updated, err := tx.UpdateScenarioIfVersion(r.Context(), scenario, current.Version)
		if err != nil {
			apperrors.RespondInternalError(w, "failed to restore scenarios")
			return
		}
		if !updated {
			respondJson(w, http.StatusConflict, map[string]any{"error": "a scenario changed before the workflow could be restored", "code": "version_conflict"})
			return
		}
	}
	if err := tx.Commit(); err != nil {
		apperrors.RespondInternalError(w, "failed to commit restore")
		return
	}
	created, err := h.checkpointWorkflow(r.Context(), store, input.ProjectID, workflowID, fmt.Sprintf("Restored revision %d", revision.RevisionNumber), input.UserID)
	if err != nil {
		apperrors.RespondInternalError(w, "workflow restored but checkpoint creation failed")
		return
	}
	respondJson(w, http.StatusOK, created)
}

func (h *Handler) GetWorkflowRun(w http.ResponseWriter, r *http.Request) {
	if h.workflowService == nil {
		apperrors.RespondInternalError(w, "workflow worker is not enabled")
		return
	}
	runID := chi.URLParam(r, "workflowRunID")
	run, err := h.db.GetWorkflowRun(r.Context(), runID)
	if err != nil {
		apperrors.RespondNotFound(w, "workflow run")
		return
	}
	if projectID := r.URL.Query().Get("projectId"); projectID != "" && projectID != run.ProjectID {
		apperrors.RespondNotFound(w, "workflow run")
		return
	}
	sessions, err := h.db.ListSessionsByProjectID(r.Context(), run.ProjectID)
	if err != nil {
		apperrors.RespondInternalError(w, "failed to load workflow scenarios")
		return
	}
	filtered := sessions[:0]
	var testResults []any
	for _, session := range sessions {
		if session.WorkflowRunID != runID {
			continue
		}
		filtered = append(filtered, session)
		rows, err := h.db.ListTestResults(r.Context(), session.ID)
		if err != nil {
			apperrors.RespondInternalError(w, "failed to load workflow test results")
			return
		}
		for _, row := range rows {
			testResults = append(testResults, row)
		}
	}
	respondJson(w, http.StatusOK, map[string]any{
		"workflowRun":  run,
		"scenarioRuns": filtered,
		"testResults":  testResults,
	})
}

func (h *Handler) StreamWorkflowRunEvents(w http.ResponseWriter, r *http.Request) {
	if h.workflowService == nil {
		apperrors.RespondInternalError(w, "workflow worker is not enabled")
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		apperrors.RespondInternalError(w, "streaming is not supported")
		return
	}
	runID := chi.URLParam(r, "workflowRunID")
	run, err := h.db.GetWorkflowRun(r.Context(), runID)
	if err != nil {
		apperrors.RespondNotFound(w, "workflow run")
		return
	}
	if projectID := r.URL.Query().Get("projectId"); projectID != "" && projectID != run.ProjectID {
		apperrors.RespondNotFound(w, "workflow run")
		return
	}
	afterID, _ := strconv.ParseInt(r.Header.Get("Last-Event-ID"), 10, 64)
	if queryAfter := r.URL.Query().Get("after"); queryAfter != "" {
		if parsed, err := strconv.ParseInt(queryAfter, 10, 64); err == nil && parsed > afterID {
			afterID = parsed
		}
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	poll := time.NewTicker(500 * time.Millisecond)
	heartbeat := time.NewTicker(15 * time.Second)
	defer poll.Stop()
	defer heartbeat.Stop()
	for {
		events, err := h.workflowService.store.ListWorkflowRunEvents(r.Context(), runID, afterID, 250)
		if err != nil {
			return
		}
		for _, event := range events {
			if _, err := fmt.Fprintf(w, "id: %d\nevent: %s\ndata: %s\n\n", event.ID, event.EventType, event.Payload); err != nil {
				return
			}
			afterID = event.ID
		}
		if len(events) > 0 {
			flusher.Flush()
		}
		job, err := h.workflowService.store.GetWorkflowJob(r.Context(), runID)
		if err == nil && (job.Status == "completed" || job.Status == "failed") && len(events) == 0 {
			return
		}
		select {
		case <-r.Context().Done():
			return
		case <-poll.C:
		case <-heartbeat.C:
			if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
				return
			}
			flusher.Flush()
		}
	}
}
