package errors

import (
	"encoding/json"
	stderrors "errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestResponseWithError(t *testing.T) {
	tests := []struct {
		name       string
		err        error
		wantStatus int
		wantBody   ErrorResponse
	}{
		{
			name:       "application error",
			err:        New(ErrValidation, "validation failed").WithDetail("name", "required"),
			wantStatus: http.StatusBadRequest,
			wantBody: ErrorResponse{
				Error:   "validation failed",
				Code:    ErrValidation.String(),
				Details: map[string]string{"name": "required"},
			},
		},
		{
			name:       "unexpected error",
			err:        stderrors.New("unexpected failure"),
			wantStatus: http.StatusInternalServerError,
			wantBody: ErrorResponse{
				Error: "unexpected failure",
				Code:  ErrInternal.String(),
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()

			ResponseWithError(recorder, tt.err)

			if recorder.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d", recorder.Code, tt.wantStatus)
			}
			if got := recorder.Header().Get("Content-Type"); got != "application/json" {
				t.Fatalf("Content-Type = %q, want application/json", got)
			}

			var got ErrorResponse
			if err := json.NewDecoder(recorder.Body).Decode(&got); err != nil {
				t.Fatalf("decode response: %v", err)
			}
			if got.Error != tt.wantBody.Error || got.Code != tt.wantBody.Code {
				t.Fatalf("response = %#v, want %#v", got, tt.wantBody)
			}
			if len(got.Details) != len(tt.wantBody.Details) {
				t.Fatalf("details = %#v, want %#v", got.Details, tt.wantBody.Details)
			}
			for key, want := range tt.wantBody.Details {
				if got.Details[key] != want {
					t.Errorf("details[%q] = %q, want %q", key, got.Details[key], want)
				}
			}
		})
	}
}
