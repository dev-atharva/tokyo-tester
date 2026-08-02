package test

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"net"
	"strings"
	"syscall"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
	"github.com/dev-atharva/cots/pkg/telemetry"
)

const maxTestAttempts = 2

type FailureClass string

const (
	FailureTransientTransport FailureClass = "transient_transport"
	FailureAssertion          FailureClass = "assertion"
	FailureConfiguration      FailureClass = "configuration"
	FailureExecution          FailureClass = "execution"
	FailureTimeout            FailureClass = "timeout"
	FailureCancelled          FailureClass = "cancelled"
)

type FailurePhase string

const (
	PhaseSetup     FailurePhase = "setup"
	PhaseDispatch  FailurePhase = "dispatch"
	PhaseResponse  FailurePhase = "response"
	PhaseAssertion FailurePhase = "assertion"
	PhaseUnknown   FailurePhase = "unknown"
)

type ExecutionFailure struct {
	Class FailureClass
	Phase FailurePhase
	Code  string
	Cause error
}

func (e *ExecutionFailure) Error() string {
	if e.Cause == nil {
		return e.Code
	}
	return e.Cause.Error()
}

func (e *ExecutionFailure) Unwrap() error { return e.Cause }

func NewExecutionFailure(class FailureClass, phase FailurePhase, code string, cause error) error {
	if cause == nil {
		return nil
	}
	return &ExecutionFailure{Class: class, Phase: phase, Code: code, Cause: cause}
}

func SetupFailure(err error) error {
	if err == nil {
		return nil
	}
	if class, code, ok := transientTransportFailure(err); ok {
		return NewExecutionFailure(class, PhaseSetup, code, err)
	}
	return NewExecutionFailure(FailureExecution, PhaseSetup, "TEST_SETUP_ERROR", err)
}

func ConfigurationFailure(err error) error {
	return NewExecutionFailure(FailureConfiguration, PhaseSetup, "TEST_CONFIGURATION_ERROR", err)
}

func OperationFailure(phase FailurePhase, err error) error {
	if err == nil {
		return nil
	}
	var typed *ExecutionFailure
	if errors.As(err, &typed) || errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return err
	}
	var networkOperation *net.OpError
	if errors.As(err, &networkOperation) && networkOperation.Op == "dial" {
		phase = PhaseSetup
	}
	if class, code, ok := transientTransportFailure(err); ok {
		return NewExecutionFailure(class, phase, code, err)
	}
	return NewExecutionFailure(FailureExecution, phase, "TEST_EXECUTION_ERROR", err)
}

func AssertionFailure(err error) error {
	return NewExecutionFailure(FailureAssertion, PhaseAssertion, "TEST_ASSERTION_ERROR", err)
}

func ResultValidationFailure(err error) error {
	if err == nil {
		return nil
	}
	if _, _, transient := transientTransportFailure(err); transient {
		return OperationFailure(PhaseResponse, err)
	}
	return AssertionFailure(err)
}

type FailureInfo struct {
	Class FailureClass
	Phase FailurePhase
	Code  string
}

func ClassifyFailure(err error) FailureInfo {
	if errors.Is(err, context.Canceled) {
		return FailureInfo{Class: FailureCancelled, Phase: PhaseUnknown, Code: "TEST_CANCELLED"}
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return FailureInfo{Class: FailureTimeout, Phase: PhaseUnknown, Code: "TEST_TIMEOUT"}
	}
	var typed *ExecutionFailure
	if errors.As(err, &typed) {
		return FailureInfo{Class: typed.Class, Phase: typed.Phase, Code: typed.Code}
	}
	return FailureInfo{Class: FailureExecution, Phase: PhaseUnknown, Code: "TEST_EXECUTION_ERROR"}
}

func transientTransportFailure(err error) (FailureClass, string, bool) {
	switch {
	case errors.Is(err, syscall.ECONNRESET):
		return FailureTransientTransport, "TEST_TRANSPORT_CONNECTION_RESET", true
	case errors.Is(err, syscall.ECONNREFUSED):
		return FailureTransientTransport, "TEST_TRANSPORT_CONNECTION_REFUSED", true
	case errors.Is(err, syscall.EPIPE):
		return FailureTransientTransport, "TEST_TRANSPORT_BROKEN_PIPE", true
	case errors.Is(err, net.ErrClosed):
		return FailureTransientTransport, "TEST_TRANSPORT_CLOSED", true
	case errors.Is(err, io.ErrUnexpectedEOF):
		return FailureTransientTransport, "TEST_TRANSPORT_UNEXPECTED_EOF", true
	case errors.Is(err, io.EOF):
		return FailureTransientTransport, "TEST_TRANSPORT_EOF", true
	case errors.Is(err, driver.ErrBadConn):
		return FailureTransientTransport, "TEST_TRANSPORT_BAD_CONNECTION", true
	default:
		return "", "", false
	}
}

type Attempt struct {
	Attempt        int
	Outcome        string
	DurationMs     int64
	FailureClass   FailureClass
	FailureCode    string
	Message        string
	RetryScheduled bool
}

type ExecutionReport struct {
	Attempts   []Attempt
	DurationMs int64
	Recovered  bool
}

type RetryEvent struct {
	Attempt     int
	NextAttempt int
	MaxAttempts int
	Reason      string
	Code        string
}

type RetryOptions struct {
	Disabled bool
	Backoff  func() time.Duration
	Observer func(RetryEvent)
}

func ExecuteWithRetry(
	ctx context.Context,
	executor Executor,
	testCfg config.TestConfig,
	registry *orchestrator.RuntimeRegsitry,
	options RetryOptions,
) (ExecutionReport, error) {
	started := time.Now()
	report := ExecutionReport{Attempts: make([]Attempt, 0, maxTestAttempts)}
	lastRetryReason := ""

	for attemptNumber := 1; attemptNumber <= maxTestAttempts; attemptNumber++ {
		attemptStarted := time.Now()
		err := executor.Execute(ctx, testCfg, registry)
		attempt := Attempt{
			Attempt: attemptNumber, DurationMs: time.Since(attemptStarted).Milliseconds(),
		}
		if err == nil {
			attempt.Outcome = "passed"
			report.Attempts = append(report.Attempts, attempt)
			report.DurationMs = time.Since(started).Milliseconds()
			report.Recovered = attemptNumber > 1
			if report.Recovered {
				telemetry.RecordTestRetryRecovered(ctx, testCfg.Type, lastRetryReason)
			}
			return report, nil
		}

		info := ClassifyFailure(err)
		attempt.Outcome = "failed"
		attempt.FailureClass = info.Class
		attempt.FailureCode = info.Code
		attempt.Message = boundedAttemptMessage(err.Error())

		if attemptNumber == 1 && shouldRetry(testCfg, info, options.Disabled) {
			attempt.RetryScheduled = true
			report.Attempts = append(report.Attempts, attempt)
			lastRetryReason = strings.ToLower(strings.TrimPrefix(info.Code, "TEST_TRANSPORT_"))
			telemetry.RecordTestRetryScheduled(ctx, testCfg.Type, lastRetryReason)
			if options.Observer != nil {
				options.Observer(RetryEvent{
					Attempt: 1, NextAttempt: 2, MaxAttempts: maxTestAttempts,
					Reason: lastRetryReason, Code: info.Code,
				})
			}
			backoff := time.Duration(250+rand.IntN(251)) * time.Millisecond
			if options.Backoff != nil {
				backoff = options.Backoff()
			}
			if waitErr := waitForRetry(ctx, backoff); waitErr != nil {
				report.DurationMs = time.Since(started).Milliseconds()
				return report, waitErr
			}
			continue
		}

		report.Attempts = append(report.Attempts, attempt)
		report.DurationMs = time.Since(started).Milliseconds()
		if attemptNumber > 1 {
			telemetry.RecordTestRetryExhausted(ctx, testCfg.Type, lastRetryReason)
		}
		return report, err
	}

	return report, fmt.Errorf("test execution ended without a result")
}

func shouldRetry(testCfg config.TestConfig, info FailureInfo, disabled bool) bool {
	if disabled || testCfg.RetryPolicy.EffectiveMode() == "never" || testCfg.Type == "delay" {
		return false
	}
	if info.Class != FailureTransientTransport {
		return false
	}
	if info.Phase == PhaseSetup {
		return true
	}
	if IsAutomaticallyRetrySafe(testCfg) {
		return true
	}
	return testCfg.RetryPolicy.IdempotencyConfirmed
}

func IsAutomaticallyRetrySafe(testCfg config.TestConfig) bool {
	operation := func(key string) string {
		value, _ := testCfg.Config[key].(string)
		return strings.ToLower(strings.TrimSpace(value))
	}
	switch testCfg.Type {
	case "http":
		method := strings.ToUpper(operation("method"))
		return method == "GET" || method == "HEAD" || method == "OPTIONS"
	case "document":
		return oneOf(operation("operation"), "find_one", "find_many", "count_documents", "exists")
	case "cache":
		return oneOf(operation("operation"), "ping", "get", "exists")
	case "queue":
		return oneOf(operation("operation"), "check_topic", "list_topics")
	default:
		return false
	}
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

func waitForRetry(ctx context.Context, duration time.Duration) error {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func boundedAttemptMessage(message string) string {
	message = strings.TrimSpace(message)
	const limit = 1000
	if len(message) <= limit {
		return message
	}
	return strings.ToValidUTF8(message[:limit], "�") + "…"
}
