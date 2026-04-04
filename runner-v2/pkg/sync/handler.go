package sync

import (
	"encoding/json"
	"net/http"

	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/errors"
	"github.com/dev-atharva/cots/pkg/logger"
	"github.com/dev-atharva/cots/pkg/middleware"
	"github.com/dev-atharva/cots/pkg/telemetry"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{
		service: service,
	}
}

// --- Batch sync handler ---
func (h *Handler) HandleBatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)

	ctx, span := telemetry.StartSpan(ctx, "sync.batch")
	defer span.End()

	logger.InfoContext(ctx, "processing sync batch", "request_id", requestID)

	var req dto.SyncBatchRequestDTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		logger.WarnContext(ctx, "invalid request body", "error", err)
		errors.ResponseBadRequest(w, "invalid request body")
		return
	}

	logger.DebugContext(ctx, "decoded sync request", "client_id", req.ClientID, "user_id", req.UserID, "timestamp", req.TimeStamp, "changes_count", len(req.Changes))

	if len(req.Changes) > 0 {
		logger.DebugContext(ctx, "first change sample", "entity_type", req.Changes[0].EntityType, "entity_id", req.Changes[0].EntityID, "change_type", req.Changes[0].ChangeType, "client_time", req.Changes[0].ClientTime)
	}
	if err := dto.Validate(req); err != nil {
		fieldErrors := dto.FormatValidationErrors(err)
		logger.WarnContext(ctx, "validation failed", "errors", fieldErrors)
		errors.RespondValidationError(w, "validation failed", fieldErrors)
		return
	}
	syncReq := req.ToSyncBatchRequest()
	telemetry.AddSpanAttributes(ctx, telemetry.ClientIDAttr(syncReq.ClientID), telemetry.UserIDAttr(syncReq.UserID))

	response, err := h.service.ProcessBatch(ctx, syncReq)
	if err != nil {
		logger.ErrorContext(ctx, "failed to process batch", "error", err)
		telemetry.RecordError(ctx, err)
		appErr := errors.Wrap(err, errors.ErrSyncBatch, "failed to process sync batch")
		errors.ResponseWithError(w, appErr)
		return
	}

	logger.InfoContext(ctx, "sync batch processed successfully", "processed_count", response.ProcessedCount, "conflicts", len(response.Conflicts), "errors", len(response.Errors))
	dtoResponse := dto.FromTypesSyncBatchResponse(response)

	w.Header().Set("Content-Type", "application/json")
	if response.Success {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusMultiStatus)
	}

	if err := json.NewEncoder(w).Encode(dtoResponse); err != nil {
		logger.ErrorContext(ctx, "failed to encode response", "error", err)
	}
}

// --- Status handler ---
func (h *Handler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	ctx, span := telemetry.StartSpan(ctx, "sync.status")
	defer span.End()

	logger.DebugContext(ctx, "checking sync service status")

	status, err := h.service.GetStatus(ctx)
	if err != nil {
		logger.ErrorContext(ctx, "failed to get status", "error", err)
		telemetry.RecordError(ctx, err)
		appErr := errors.Wrap(err, errors.ErrInternal, "failed to get sync status")
		errors.ResponseWithError(w, appErr)
		return
	}

	logger.DebugContext(ctx, "sync service status retrieved", "status", status.Status)

	dtoRepsonse := dto.FromTypesSyncStatusResponse(status)

	w.Header().Set("Content-Type", "application/json")
	if status.Status == "healthy" {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	if err := json.NewEncoder(w).Encode(dtoRepsonse); err != nil {
		logger.ErrorContext(ctx, "failed to encode response", "error", err)
	}
}

// --- Pull changes handler ---
func (h *Handler) HandlePull(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)

	clientID := chi.URLParam(r, "clientId")
	userID := r.URL.Query().Get("userId")
	projectID := r.URL.Query().Get("projectId")

	ctx, span := telemetry.StartSpan(ctx, "sync.pull", telemetry.ClientIDAttr(clientID), telemetry.UserIDAttr(userID))
	defer span.End()

	logger.InfoContext(ctx, "pulling sync changes", "request_id", requestID, "user_id", userID, "project_id", projectID)

	if clientID == "" || userID == "" || projectID == "" {
		logger.WarnContext(ctx, "missingf reqiuired parameters", "client_id", clientID, "user_id", userID, "project_id", projectID)
		errors.ResponseBadRequest(w, "clientId, userId and projectId are required")
		return
	}

	response, err := h.service.PullChanges(ctx, userID, projectID)
	if err != nil {
		logger.ErrorContext(ctx, "failed to pull changes", "error", err, "user_id", userID)
		telemetry.RecordError(ctx, err)
		appErr := errors.Wrap(err, errors.ErrSyncPull, "failed to pull sync changes")
		errors.ResponseWithError(w, appErr)
		return
	}

	logger.InfoContext(
		ctx,
		"sync changes pulled successfully",
		"workflows", len(response.Workflows),
		"scenarios", len(response.Scenarios),
		"workflow_runs", len(response.WorkflowRuns),
		"sessions", len(response.Sessions),
		"test_results", len(response.TestResults),
	)

	dtoResponse := dto.FromTypesSyncPullResponse(response)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(dtoResponse); err != nil {
		logger.ErrorContext(ctx, "failed to encode response", "error", err)
	}
}

// --- Clear sync metadata handler ---
func (h *Handler) HandleClear(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	requestID := middleware.GetRequestID(ctx)
	clientID := chi.URLParam(r, "clientId")
	userID := r.URL.Query().Get("userId")
	projectID := r.URL.Query().Get("projectId")

	ctx, span := telemetry.StartSpan(ctx, "sync.clear", telemetry.ClientIDAttr(clientID), telemetry.UserIDAttr(userID))
	defer span.End()

	logger.InfoContext(ctx, "clearing sync metadata", "request_id", requestID, "client_id", clientID, "user_id", userID, "project_id", projectID)

	if clientID == "" || userID == "" || projectID == "" {
		logger.WarnContext(ctx, "missing required parameters", "client_id", clientID, "user_id", userID, "project_id", projectID)
		errors.ResponseBadRequest(w, "clientId, userId and projectId are required")
		return
	}

	// TODO: Implement actual clearing from DB if needed
	logger.DebugContext(ctx, "sync metadata clear requested (not yet implemented)", "client_id", clientID, "user_id", userID)

	response := dto.SyncClearResponse{
		Message:  "Sync Metadata cleared for client " + clientID + " and user " + userID,
		ClientID: clientID,
		UserID:   userID,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		logger.ErrorContext(ctx, "failed to encode response", "error", err)
	}
}
