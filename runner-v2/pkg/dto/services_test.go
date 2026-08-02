package dto

import "testing"

func TestMockServerServiceValidationAndTranslation(t *testing.T) {
	service := ServiceDTO{
		Name: "mock-api",
		Type: "mockserver",
		MockServerExpectations: []MockServerExpectationDTO{{
			ID:       "health",
			Request:  MockServerExpectationMatchDTO{Method: "GET", Path: "/health"},
			Response: MockServerExpectationReplyDTO{StatusCode: 200, Body: "ready"},
		}},
	}
	if err := Validate(service); err != nil {
		t.Fatalf("valid MockServer service rejected: %v", err)
	}
	cfg := service.ToConfig()
	if len(cfg.MockServerExpectations) != 1 || cfg.MockServerExpectations[0].Request.Path != "/health" {
		t.Fatalf("MockServer expectations were not translated: %#v", cfg.MockServerExpectations)
	}
}

func TestMockServerExpectationsRejectedOnOtherServiceTypes(t *testing.T) {
	service := ServiceDTO{
		Name: "web",
		Type: "nginx",
		MockServerExpectations: []MockServerExpectationDTO{{
			ID:       "invalid",
			Request:  MockServerExpectationMatchDTO{Method: "GET", Path: "/"},
			Response: MockServerExpectationReplyDTO{StatusCode: 200},
		}},
	}
	if err := Validate(service); err == nil {
		t.Fatal("expected MockServer expectations on nginx to be rejected")
	}
}

func TestMockServerExpectationValidation(t *testing.T) {
	tests := []struct {
		name     string
		request  MockServerExpectationMatchDTO
		response MockServerExpectationReplyDTO
	}{
		{name: "invalid method", request: MockServerExpectationMatchDTO{Method: "TRACE", Path: "/"}, response: MockServerExpectationReplyDTO{StatusCode: 200}},
		{name: "relative path", request: MockServerExpectationMatchDTO{Method: "GET", Path: "health"}, response: MockServerExpectationReplyDTO{StatusCode: 200}},
		{name: "invalid status", request: MockServerExpectationMatchDTO{Method: "GET", Path: "/"}, response: MockServerExpectationReplyDTO{StatusCode: 99}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service := ServiceDTO{Name: "mock-api", Type: "mockserver", MockServerExpectations: []MockServerExpectationDTO{{ID: "test", Request: test.request, Response: test.response}}}
			if err := Validate(service); err == nil {
				t.Fatal("expected validation error")
			}
		})
	}
}

func TestMockServerExpectationRejectsInvalidHeadersAndDuplicateIDs(t *testing.T) {
	service := ServiceDTO{
		Name: "mock-api",
		Type: "mockserver",
		MockServerExpectations: []MockServerExpectationDTO{
			{ID: "duplicate", Request: MockServerExpectationMatchDTO{Method: "GET", Path: "/one", Headers: map[string]string{"Bad Header": "value"}}, Response: MockServerExpectationReplyDTO{StatusCode: 200}},
			{ID: "duplicate", Request: MockServerExpectationMatchDTO{Method: "GET", Path: "/two"}, Response: MockServerExpectationReplyDTO{StatusCode: 200}},
		},
	}
	if err := Validate(service); err == nil {
		t.Fatal("expected malformed headers or duplicate ids to be rejected")
	}
}
