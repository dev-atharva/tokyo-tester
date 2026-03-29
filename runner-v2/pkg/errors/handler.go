package errors

import (
	"encoding/json"
	"net/http"

	"github.com/dev-atharva/cots/pkg/logger"
)

type ErrorResponse struct {
	Error   string            `json:"error"`
	Code    string            `json:"code"`
	Details map[string]string `json:"details,omitempty"`
}

func ResponseWithError(w http.ResponseWriter, err error) {
	var appErr *AppError
	var statusCode int
	var response ErrorResponse

	if IsAppError(err) {
		appErr = err.(*AppError)
		statusCode = appErr.Code.HTTPStatusCode()
		response = ErrorResponse{
			Error:   appErr.Message,
			Code:    appErr.Code.String(),
			Details: appErr.Details,
		}
	} else {
		statusCode = http.StatusInternalServerError
		response = ErrorResponse{
			Error: err.Error(),
			Code:  ErrInternal.String(),
		}

		logger.Error("request error", "status_code", statusCode, "error_code", response.Code, "error", response.Error)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(statusCode)
		json.NewEncoder(w).Encode(response)
	}
}

func RespondValidationError(w http.ResponseWriter, message string, fieldErrors map[string]string) {
	err := ValidationError(message, fieldErrors)
	ResponseWithError(w, err)
}

func RespondInternalError(w http.ResponseWriter, message string) {
	err := New(ErrInternal, message)
	ResponseWithError(w, err)
}

func RespondNotFound(w http.ResponseWriter, resource string) {
	err := New(ErrServiceNotFound, resource+" not found")
	ResponseWithError(w, err)
}

func ResponseBadRequest(w http.ResponseWriter, message string) {
	err := New(ErrInvalidRequest, message)
	ResponseWithError(w, err)
}
