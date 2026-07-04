package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	apperrors "github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/workflowrun"
	"github.com/go-chi/chi/v5"
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
		"workflowRunId": request.WorkflowRunID,
		"status":        job.Status,
		"created":       created,
	})
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
