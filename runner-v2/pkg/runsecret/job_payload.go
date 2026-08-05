package runsecret

import (
	"encoding/json"
	"errors"

	"github.com/dev-atharva/cots/pkg/workflowrun"
)

const jobPayloadVersion = 1

type jobPayload struct {
	Version int                  `json:"version"`
	Request *workflowrun.Request `json:"request"`
	Secrets []SuppliedValue      `json:"runSecrets,omitempty"`
}

func EncodeJobPayload(request *workflowrun.Request, secrets *RunSecrets) ([]byte, error) {
	if request == nil {
		return nil, errors.New("workflow run request is required")
	}
	values := make([]SuppliedValue, 0)
	if secrets != nil {
		if err := secrets.VisitValues(func(name string, value []byte) error {
			values = append(values, SuppliedValue{SecretRef: name, Value: append([]byte(nil), value...)})
			return nil
		}); err != nil {
			return nil, err
		}
	}
	defer func() {
		for index := range values {
			Clear(values[index].Value)
		}
	}()
	return json.Marshal(jobPayload{Version: jobPayloadVersion, Request: request, Secrets: values})
}

func DecodeJobPayload(payload []byte) (*workflowrun.Request, *RunSecrets, error) {
	var envelope jobPayload
	if err := json.Unmarshal(payload, &envelope); err == nil && envelope.Version != 0 {
		if envelope.Version != jobPayloadVersion || envelope.Request == nil {
			return nil, nil, errors.New("unsupported workflow job payload")
		}
		secrets, err := Authorize(envelope.Request, envelope.Secrets)
		for index := range envelope.Secrets {
			Clear(envelope.Secrets[index].Value)
		}
		if err != nil {
			return nil, nil, err
		}
		return envelope.Request, secrets, nil
	}

	// Jobs admitted before the run-secret envelope existed contained only the
	// request. They remain recoverable when the request has no run secrets.
	var legacy workflowrun.Request
	if err := json.Unmarshal(payload, &legacy); err != nil {
		return nil, nil, err
	}
	secrets, err := Authorize(&legacy, nil)
	if err != nil {
		return nil, nil, err
	}
	return &legacy, secrets, nil
}
