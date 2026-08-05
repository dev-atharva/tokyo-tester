package runsecret

import (
	"encoding/base64"
	"encoding/json"
	"net/url"
	"reflect"
	"strings"
	"testing"

	"github.com/dev-atharva/cots/pkg/workflowbundle"
	"github.com/dev-atharva/cots/pkg/workflowrun"
)

func TestRequiredReferencesAreSortedDistinctAcrossSelectedScenarios(t *testing.T) {
	request := secretRequest("PASSWORD", "API_TOKEN", "PASSWORD")
	got, err := RequiredReferences(request)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"API_TOKEN", "PASSWORD"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("required references = %v, want %v", got, want)
	}
}

func TestAuthorizeRequiresExactNonEmptyReferenceSet(t *testing.T) {
	request := secretRequest("PASSWORD", "API_TOKEN")
	tests := []struct {
		name   string
		values []SuppliedValue
		code   string
	}{
		{name: "missing", values: []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("one")}}, code: CodeMissing},
		{name: "extra", values: []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("one")}, {SecretRef: "API_TOKEN", Value: []byte("two")}, {SecretRef: "UNKNOWN", Value: []byte("three")}}, code: CodeExtra},
		{name: "duplicate", values: []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("one")}, {SecretRef: "PASSWORD", Value: []byte("two")}, {SecretRef: "API_TOKEN", Value: []byte("three")}}, code: CodeDuplicate},
		{name: "empty", values: []SuppliedValue{{SecretRef: "PASSWORD", Value: nil}, {SecretRef: "API_TOKEN", Value: []byte("two")}}, code: CodeEmpty},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, err := Authorize(request, test.values)
			var resolution *ResolutionError
			if err == nil || !AsResolutionError(err, &resolution) || resolution.Code != test.code {
				t.Fatalf("error = %#v, want code %q", err, test.code)
			}
		})
	}

	secrets, err := Authorize(request, []SuppliedValue{{SecretRef: "API_TOKEN", Value: []byte("two")}, {SecretRef: "PASSWORD", Value: []byte("one")}})
	if err != nil {
		t.Fatal(err)
	}
	defer secrets.Destroy()
	if got := secrets.Names(); !reflect.DeepEqual(got, []string{"API_TOKEN", "PASSWORD"}) {
		t.Fatalf("names = %v", got)
	}
}

func TestScenarioSubsetSharesSameNameAndSeparatesDifferentNames(t *testing.T) {
	request := secretRequest("PASSWORD", "PASSWORD", "PASSWORD", "API_TOKEN")
	secrets, err := Authorize(request, []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("shared")}, {SecretRef: "API_TOKEN", Value: []byte("separate")}})
	if err != nil {
		t.Fatal(err)
	}
	defer secrets.Destroy()

	first, err := secrets.ForScenario(request.Scenarios[0])
	if err != nil {
		t.Fatal(err)
	}
	defer first.Destroy()
	second, err := secrets.ForScenario(request.Scenarios[1])
	if err != nil {
		t.Fatal(err)
	}
	defer second.Destroy()
	if !reflect.DeepEqual(first.Names(), []string{"PASSWORD"}) {
		t.Fatalf("first names = %v", first.Names())
	}
	if !reflect.DeepEqual(second.Names(), []string{"API_TOKEN", "PASSWORD"}) {
		t.Fatalf("second names = %v", second.Names())
	}
}

func TestRunSecretsCannotBeJSONSerializedAndDestroyClearsAccess(t *testing.T) {
	request := secretRequest("PASSWORD")
	secrets, err := Authorize(request, []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("sentinel")}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := json.Marshal(secrets); err == nil {
		t.Fatal("run secrets unexpectedly serialized")
	}
	secrets.Destroy()
	if secrets.Present() || len(secrets.Names()) != 0 {
		t.Fatalf("destroyed secrets remain available: %v", secrets.Names())
	}
}

func TestQueuePayloadRoundTripKeepsSecretsOutOfPublicRequest(t *testing.T) {
	request := secretRequest("PASSWORD")
	secrets, err := Authorize(request, []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte("sentinel")}})
	if err != nil {
		t.Fatal(err)
	}
	defer secrets.Destroy()
	payload, err := EncodeJobPayload(request, secrets)
	if err != nil {
		t.Fatal(err)
	}
	defer Clear(payload)
	decodedRequest, decodedSecrets, err := DecodeJobPayload(payload)
	if err != nil {
		t.Fatal(err)
	}
	defer decodedSecrets.Destroy()
	if decodedRequest.WorkflowRunID != request.WorkflowRunID || !reflect.DeepEqual(decodedSecrets.Names(), []string{"PASSWORD"}) {
		t.Fatalf("decoded payload = %#v, names %v", decodedRequest, decodedSecrets.Names())
	}
	if _, err := json.Marshal(decodedSecrets); err == nil {
		t.Fatal("decoded run secrets unexpectedly serialized")
	}
}

func TestRedactorCoversRawAndCommonEncodingsAcrossChunks(t *testing.T) {
	secret := "p@ss word/with?symbols"
	request := secretRequest("PASSWORD")
	secrets, err := Authorize(request, []SuppliedValue{{SecretRef: "PASSWORD", Value: []byte(secret)}})
	if err != nil {
		t.Fatal(err)
	}
	defer secrets.Destroy()
	encoded := []string{
		secret,
		url.QueryEscape(secret),
		url.PathEscape(secret),
		base64.StdEncoding.EncodeToString([]byte(secret)),
		base64.RawURLEncoding.EncodeToString([]byte(secret)),
	}
	for _, value := range encoded {
		if got := secrets.RedactString("before " + value + " after"); strings.Contains(got, value) || !strings.Contains(got, Redacted) {
			t.Fatalf("redaction failed for %q: %q", value, got)
		}
	}

	stream := secrets.NewStreamRedactor()
	var output strings.Builder
	for _, chunk := range []string{"prefix p@ss", " word/with", "?symbols suffix"} {
		_, _ = output.Write(stream.WriteChunk([]byte(chunk)))
	}
	_, _ = output.Write(stream.Flush())
	if strings.Contains(output.String(), secret) || !strings.Contains(output.String(), Redacted) {
		t.Fatalf("stream output leaked secret: %q", output.String())
	}
}

func secretRequest(refs ...string) *workflowrun.Request {
	scenarios := make([]workflowrun.Scenario, 0, 2)
	for index := 0; index < len(refs); index += 2 {
		end := index + 2
		if end > len(refs) {
			end = len(refs)
		}
		steps := make([]workflowbundle.ScenarioStep, 0, end-index)
		order := make([]string, 0, end-index)
		for offset, ref := range refs[index:end] {
			id := ref + string(rune('a'+offset))
			steps = append(steps, workflowbundle.ScenarioStep{ID: id, Name: id, Kind: "action", Action: &workflowbundle.StepAction{Operation: "fill", Locator: &workflowbundle.BrowserLocator{Strategy: "label", Value: "Password"}, Value: &workflowbundle.StepValue{Source: "run-secret", SecretRef: ref}}})
			order = append(order, id)
		}
		name := "Scenario " + string(rune('A'+index))
		scenarios = append(scenarios, workflowrun.Scenario{ID: "scenario-" + string(rune('a'+index)), ScenarioRunID: "scenario-run-" + string(rune('a'+index)), ProjectID: "project", Name: name, ExecutionModel: workflowbundle.ExecutionModelJourney, Environment: &workflowbundle.JourneyEnvironment{Driver: "browser", Browser: workflowbundle.BrowserEnvironment{TargetService: "web", TargetPort: "3000"}}, Steps: steps, StepOrder: order})
	}
	return &workflowrun.Request{
		WorkflowRunID: "run", ProjectID: "project", WorkflowID: "workflow", WorkflowName: "Workflow",
		Nodes:     []workflowbundle.FlowNode{{ID: "web", Data: workflowbundle.FlowNodeData{Label: "web", Service: workflowbundle.ServiceNodeData{Type: "generic", Image: "web:test", Ports: []workflowbundle.PortMapping{{ContainerPort: "3000"}}}}}},
		Scenarios: scenarios,
	}
}
