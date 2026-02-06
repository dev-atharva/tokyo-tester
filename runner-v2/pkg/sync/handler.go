package sync

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/dev-atharva/cots/pkg/types"
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

	var req types.SyncBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Failed to decode batch sync request: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.ClientID == "" || req.UserID == "" {
		http.Error(w, "client_id and user_id are required", http.StatusBadRequest)
		return
	}

	if len(req.Changes) == 0 {
		http.Error(w, "changes array cannot be empty", http.StatusBadRequest)
		return
	}

	response, err := h.service.ProcessBatch(ctx, &req)
	if err != nil {
		log.Printf("Failed to process batch: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if response.Success {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusMultiStatus)
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode response: %v", err)
	}
}

// --- Status handler ---
func (h *Handler) HandleStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	status, err := h.service.GetStatus(ctx)
	if err != nil {
		log.Printf("Failed to get status: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	if status.Status == "healthy" {
		w.WriteHeader(http.StatusOK)
	} else {
		w.WriteHeader(http.StatusServiceUnavailable)
	}

	if err := json.NewEncoder(w).Encode(status); err != nil {
		log.Printf("Failed to encode response: %v", err)
	}
}

// --- Pull changes handler ---
func (h *Handler) HandlePull(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	clientID := chi.URLParam(r, "clientId")
	userID := r.URL.Query().Get("userId")

	if clientID == "" || userID == "" {
		http.Error(w, "clientId and userId are required", http.StatusBadRequest)
		return
	}

	response, err := h.service.PullChanges(ctx, userID)
	if err != nil {
		log.Printf("Failed to pull changes: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode response: %v", err)
	}
}

// --- Clear sync metadata handler ---
func (h *Handler) HandleClear(w http.ResponseWriter, r *http.Request) {
	clientID := chi.URLParam(r, "clientId")
	userID := r.URL.Query().Get("userId") // get userId as query param

	if clientID == "" || userID == "" {
		http.Error(w, "clientId and userId are required", http.StatusBadRequest)
		return
	}

	// TODO: Implement actual clearing from DB if needed

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	response := map[string]string{
		"message": "Sync metadata cleared for client " + clientID + " and user " + userID,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode response: %v", err)
	}
}
