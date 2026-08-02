package predefined

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/config"
)

func TestMockServerInitializationJSON(t *testing.T) {
	payload, err := mockServerInitializationJSON([]config.MockServerExpectation{{
		ID: "user-by-id",
		Request: config.MockServerExpectationMatch{
			Method:  "GET",
			Path:    "/api/users/42",
			Headers: map[string]string{"X-Tenant": "tokyo"},
		},
		Response: config.MockServerExpectationReply{
			StatusCode: 200,
			Headers:    map[string]string{"Content-Type": "application/json"},
			Body:       `{"id":42,"name":"Tokyo"}`,
		},
	}})
	if err != nil {
		t.Fatalf("mockServerInitializationJSON() error = %v", err)
	}

	var decoded []map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("initializer is not JSON: %v", err)
	}
	if len(decoded) != 1 {
		t.Fatalf("expected one initializer, got %d", len(decoded))
	}
	request := decoded[0]["httpRequest"].(map[string]any)
	response := decoded[0]["httpResponse"].(map[string]any)
	if request["method"] != "GET" || request["path"] != "/api/users/42" {
		t.Fatalf("unexpected request initializer: %#v", request)
	}
	if response["statusCode"] != float64(200) || response["body"] != `{"id":42,"name":"Tokyo"}` {
		t.Fatalf("unexpected response initializer: %#v", response)
	}
	if _, leaked := decoded[0]["id"]; leaked {
		t.Fatal("Tokyo Tester expectation ids must not be sent as MockServer ids")
	}
}

func TestMockServerInitializationJSONAllowsEmptyExpectations(t *testing.T) {
	payload, err := mockServerInitializationJSON(nil)
	if err != nil {
		t.Fatalf("mockServerInitializationJSON() error = %v", err)
	}
	if string(payload) != "[]" {
		t.Fatalf("expected empty initializer array, got %s", payload)
	}
}

func TestValidateMockServerExpectationCountRejectsBrokenInitialization(t *testing.T) {
	if err := validateMockServerExpectationCount(strings.NewReader(`not-json`), 1); err == nil {
		t.Fatal("expected malformed initializer response to fail")
	}
	if err := validateMockServerExpectationCount(strings.NewReader(`[]`), 1); err == nil {
		t.Fatal("expected missing initialized expectation to fail")
	}
	if err := validateMockServerExpectationCount(strings.NewReader(`[{}]`), 1); err != nil {
		t.Fatalf("expected matching initialized expectation count to pass: %v", err)
	}
}
