package api

import (
	"net/http"

	"github.com/dev-atharva/cots/pkg/workflowbundle"
)

func (h *Handler) GetWorkflowBundleCapabilities(w http.ResponseWriter, _ *http.Request) {
	respondJson(w, http.StatusOK, workflowbundle.AgentCapabilities())
}

func (h *Handler) ValidateWorkflowBundle(w http.ResponseWriter, r *http.Request) {
	bundle, err := workflowbundle.Decode(http.MaxBytesReader(w, r.Body, 10<<20))
	if err != nil {
		respondJson(w, http.StatusUnprocessableEntity, map[string]any{
			"valid":  false,
			"issues": []workflowbundle.ValidationIssue{workflowbundle.ValidationIssueFor(err)},
		})
		return
	}
	if issues := workflowbundle.InlineSecretIssues(bundle); len(issues) > 0 {
		respondJson(w, http.StatusUnprocessableEntity, map[string]any{"valid": false, "issues": issues})
		return
	}
	respondJson(w, http.StatusOK, map[string]any{"valid": true, "bundle": bundle, "issues": []workflowbundle.ValidationIssue{}})
}
