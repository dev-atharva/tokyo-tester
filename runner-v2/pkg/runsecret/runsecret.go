package runsecret

import (
	"context"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"sync"

	"github.com/dev-atharva/cots/pkg/workflowrun"
)

const (
	Redacted      = "[REDACTED]"
	CodeRequired  = "human_authorization_required"
	CodeMissing   = "missing_run_secret"
	CodeExtra     = "extra_run_secret"
	CodeDuplicate = "duplicate_run_secret"
	CodeEmpty     = "empty_run_secret"
)

type SuppliedValue struct {
	SecretRef string `json:"secretRef"`
	Value     []byte `json:"value"`
}

type ResolutionError struct {
	Code       string
	References []string
	message    string
}

func (e *ResolutionError) Error() string { return e.message }

func AsResolutionError(err error, target **ResolutionError) bool {
	return errors.As(err, target)
}

type secretState struct {
	mu        sync.RWMutex
	values    map[string][]byte
	destroyed bool
}

// RunSecrets is an opaque, run-scoped value. It intentionally has no useful
// JSON or formatting representation; only the narrow operations below may
// observe its contents.
type RunSecrets struct{ state *secretState }

func (s *RunSecrets) MarshalJSON() ([]byte, error) {
	return nil, errors.New("run secrets cannot be serialized")
}

func RequiredReferences(request *workflowrun.Request) ([]string, error) {
	if request == nil {
		return nil, errors.New("workflow run request is required")
	}
	if err := request.Validate(); err != nil {
		return nil, err
	}
	set := make(map[string]struct{})
	for _, scenario := range request.Scenarios {
		for _, name := range ScenarioReferences(scenario) {
			set[name] = struct{}{}
		}
	}
	return sortedKeys(set), nil
}

func ScenarioReferences(scenario workflowrun.Scenario) []string {
	set := make(map[string]struct{})
	for _, step := range scenario.Steps {
		if step.Action == nil || step.Action.Value == nil || step.Action.Value.Source != "run-secret" {
			continue
		}
		set[step.Action.Value.SecretRef] = struct{}{}
	}
	return sortedKeys(set)
}

func Authorize(request *workflowrun.Request, supplied []SuppliedValue) (*RunSecrets, error) {
	required, err := RequiredReferences(request)
	if err != nil {
		return nil, err
	}
	return New(required, supplied)
}

// New constructs one run-scoped set from an exact, already-derived required
// reference set. Most callers should use Authorize so derivation and
// construction cannot drift apart.
func New(required []string, supplied []SuppliedValue) (*RunSecrets, error) {
	requiredSet := make(map[string]struct{}, len(required))
	for _, name := range required {
		requiredSet[name] = struct{}{}
	}
	values := make(map[string][]byte, len(supplied))
	for _, item := range supplied {
		if _, exists := values[item.SecretRef]; exists {
			clearValues(values)
			return nil, resolutionError(CodeDuplicate, []string{item.SecretRef}, "duplicate run-secret value")
		}
		if len(item.Value) == 0 {
			clearValues(values)
			return nil, resolutionError(CodeEmpty, []string{item.SecretRef}, "run-secret values cannot be empty")
		}
		values[item.SecretRef] = append([]byte(nil), item.Value...)
	}
	extra := make([]string, 0)
	for name := range values {
		if _, ok := requiredSet[name]; !ok {
			extra = append(extra, name)
		}
	}
	if len(extra) > 0 {
		clearValues(values)
		sort.Strings(extra)
		return nil, resolutionError(CodeExtra, extra, "unknown or extra run-secret values")
	}
	missing := make([]string, 0)
	for _, name := range required {
		if _, ok := values[name]; !ok {
			missing = append(missing, name)
		}
	}
	if len(missing) > 0 {
		clearValues(values)
		return nil, resolutionError(CodeMissing, missing, "required run-secret values are missing")
	}
	return &RunSecrets{state: &secretState{values: values}}, nil
}

func RequireHumanAuthorization(request *workflowrun.Request) error {
	required, err := RequiredReferences(request)
	if err != nil {
		return err
	}
	if len(required) == 0 {
		return nil
	}
	return resolutionError(CodeRequired, required, "run secrets require authorization by an authenticated human")
}

func (s *RunSecrets) Present() bool {
	if s == nil || s.state == nil {
		return false
	}
	s.state.mu.RLock()
	defer s.state.mu.RUnlock()
	return !s.state.destroyed && len(s.state.values) > 0
}

func (s *RunSecrets) Names() []string {
	if s == nil || s.state == nil {
		return nil
	}
	s.state.mu.RLock()
	defer s.state.mu.RUnlock()
	if s.state.destroyed {
		return nil
	}
	set := make(map[string]struct{}, len(s.state.values))
	for name := range s.state.values {
		set[name] = struct{}{}
	}
	return sortedKeys(set)
}

func (s *RunSecrets) Contains(name string) bool {
	if s == nil || s.state == nil {
		return false
	}
	s.state.mu.RLock()
	defer s.state.mu.RUnlock()
	_, ok := s.state.values[name]
	return ok && !s.state.destroyed
}

func (s *RunSecrets) ForScenario(scenario workflowrun.Scenario) (*RunSecrets, error) {
	return s.Subset(ScenarioReferences(scenario))
}

func (s *RunSecrets) ValidateFor(request *workflowrun.Request) error {
	required, err := RequiredReferences(request)
	if err != nil {
		return err
	}
	actual := s.Names()
	if len(required) != len(actual) {
		return resolutionError(CodeMissing, required, "run-secret set does not match the execution selection")
	}
	for index := range required {
		if required[index] != actual[index] {
			return resolutionError(CodeMissing, required, "run-secret set does not match the execution selection")
		}
	}
	return nil
}

func (s *RunSecrets) Subset(required []string) (*RunSecrets, error) {
	values := make(map[string][]byte, len(required))
	if len(required) == 0 {
		return &RunSecrets{state: &secretState{values: values}}, nil
	}
	if s == nil || s.state == nil {
		return nil, resolutionError(CodeMissing, required, "required run-secret values are unavailable")
	}
	s.state.mu.RLock()
	defer s.state.mu.RUnlock()
	if s.state.destroyed {
		return nil, errors.New("run secrets have been destroyed")
	}
	for _, name := range required {
		value, ok := s.state.values[name]
		if !ok {
			clearValues(values)
			return nil, resolutionError(CodeMissing, []string{name}, "required run-secret value is unavailable")
		}
		values[name] = append([]byte(nil), value...)
	}
	return &RunSecrets{state: &secretState{values: values}}, nil
}

// VisitValues gives one authorized invocation a short-lived copy of each
// value. The copy is cleared immediately after the callback returns.
func (s *RunSecrets) VisitValues(visit func(name string, value []byte) error) error {
	if s == nil || s.state == nil {
		return nil
	}
	s.state.mu.RLock()
	defer s.state.mu.RUnlock()
	if s.state.destroyed {
		return errors.New("run secrets have been destroyed")
	}
	for _, name := range sortedValueKeys(s.state.values) {
		copyValue := append([]byte(nil), s.state.values[name]...)
		err := visit(name, copyValue)
		Clear(copyValue)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *RunSecrets) Destroy() {
	if s == nil || s.state == nil {
		return
	}
	s.state.mu.Lock()
	defer s.state.mu.Unlock()
	if s.state.destroyed {
		return
	}
	clearValues(s.state.values)
	s.state.values = nil
	s.state.destroyed = true
}

func (s *RunSecrets) RedactString(value string) string {
	patterns := s.patterns()
	for _, pattern := range patterns {
		value = strings.ReplaceAll(value, string(pattern), Redacted)
	}
	return value
}

func (s *RunSecrets) patterns() [][]byte {
	set := make(map[string]struct{})
	_ = s.VisitValues(func(_ string, value []byte) error {
		raw := string(value)
		candidates := []string{
			raw,
			url.QueryEscape(raw),
			url.PathEscape(raw),
			base64.StdEncoding.EncodeToString(value),
			base64.RawStdEncoding.EncodeToString(value),
			base64.URLEncoding.EncodeToString(value),
			base64.RawURLEncoding.EncodeToString(value),
			hex.EncodeToString(value),
		}
		if encoded, err := json.Marshal(raw); err == nil && len(encoded) >= 2 {
			candidates = append(candidates, string(encoded[1:len(encoded)-1]))
		}
		for _, candidate := range candidates {
			if candidate != "" {
				set[candidate] = struct{}{}
			}
		}
		return nil
	})
	patterns := make([][]byte, 0, len(set))
	for pattern := range set {
		patterns = append(patterns, []byte(pattern))
	}
	sort.Slice(patterns, func(i, j int) bool { return len(patterns[i]) > len(patterns[j]) })
	return patterns
}

type StreamRedactor struct {
	patterns [][]byte
	pending  []byte
	max      int
}

func (s *RunSecrets) NewStreamRedactor() *StreamRedactor {
	patterns := s.patterns()
	maximum := 1
	for _, pattern := range patterns {
		if len(pattern) > maximum {
			maximum = len(pattern)
		}
	}
	return &StreamRedactor{patterns: patterns, max: maximum}
}

func (r *StreamRedactor) WriteChunk(chunk []byte) []byte {
	r.pending = append(r.pending, chunk...)
	limit := len(r.pending) - (r.max - 1)
	if limit <= 0 {
		return nil
	}
	return r.consume(limit)
}

func (r *StreamRedactor) Flush() []byte {
	output := r.consume(len(r.pending))
	r.pending = nil
	return output
}

func (r *StreamRedactor) consume(limit int) []byte {
	output := make([]byte, 0, limit)
	consumed := 0
	for consumed < limit {
		matched := false
		for _, pattern := range r.patterns {
			if len(pattern) <= len(r.pending)-consumed && string(r.pending[consumed:consumed+len(pattern)]) == string(pattern) {
				output = append(output, Redacted...)
				consumed += len(pattern)
				matched = true
				break
			}
		}
		if !matched {
			output = append(output, r.pending[consumed])
			consumed++
		}
	}
	r.pending = append(r.pending[:0], r.pending[consumed:]...)
	return output
}

type contextKey struct{}

func WithContext(ctx context.Context, secrets *RunSecrets) context.Context {
	return context.WithValue(ctx, contextKey{}, secrets)
}

func FromContext(ctx context.Context) *RunSecrets {
	secrets, _ := ctx.Value(contextKey{}).(*RunSecrets)
	return secrets
}

func RedactContext(ctx context.Context, value string) string {
	if secrets := FromContext(ctx); secrets != nil {
		return secrets.RedactString(value)
	}
	return value
}

func resolutionError(code string, references []string, message string) *ResolutionError {
	return &ResolutionError{Code: code, References: append([]string(nil), references...), message: message}
}

func sortedKeys(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func sortedValueKeys(values map[string][]byte) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func clearValues(values map[string][]byte) {
	for name, value := range values {
		Clear(value)
		delete(values, name)
	}
}

func Clear(value []byte) {
	for index := range value {
		value[index] = 0
	}
}

func (e *ResolutionError) Format(state fmt.State, verb rune) {
	_, _ = fmt.Fprint(state, e.message)
}
