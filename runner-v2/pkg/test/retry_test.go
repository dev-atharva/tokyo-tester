package test

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"net"
	"syscall"
	"testing"
	"time"

	"github.com/dev-atharva/cots/pkg/config"
	"github.com/dev-atharva/cots/pkg/orchestrator"
)

type retryExecutorFunc func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error

func (f retryExecutorFunc) Execute(ctx context.Context, cfg config.TestConfig, registry *orchestrator.RuntimeRegsitry) error {
	return f(ctx, cfg, registry)
}

func TestExecuteWithRetrySafeHTTPRecovers(t *testing.T) {
	attempts := 0
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		attempts++
		if attempts == 1 {
			return OperationFailure(PhaseDispatch, fmt.Errorf("request failed: %w", syscall.ECONNRESET))
		}
		return nil
	})

	report, err := ExecuteWithRetry(context.Background(), executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "GET"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
	if err != nil {
		t.Fatal(err)
	}
	if attempts != 2 || !report.Recovered || len(report.Attempts) != 2 || !report.Attempts[0].RetryScheduled {
		t.Fatalf("unexpected retry report: attempts=%d report=%#v", attempts, report)
	}
}

func TestExecuteWithRetryUnsafeRequiresConfirmation(t *testing.T) {
	for _, tt := range []struct {
		name      string
		confirmed bool
		want      int
	}{
		{name: "default", want: 1},
		{name: "confirmed", confirmed: true, want: 2},
	} {
		t.Run(tt.name, func(t *testing.T) {
			attempts := 0
			executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
				attempts++
				return OperationFailure(PhaseDispatch, syscall.ECONNRESET)
			})
			_, _ = ExecuteWithRetry(context.Background(), executor, config.TestConfig{
				Type: "http", RetryPolicy: config.TestRetryPolicy{IdempotencyConfirmed: tt.confirmed},
				Config: map[string]any{"method": "POST"},
			}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
			if attempts != tt.want {
				t.Fatalf("attempts=%d, want %d", attempts, tt.want)
			}
		})
	}
}

func TestExecuteWithRetryRequiresTypedTransportFailure(t *testing.T) {
	attempts := 0
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		attempts++
		return syscall.ECONNRESET
	})

	_, _ = ExecuteWithRetry(context.Background(), executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "GET"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
	if attempts != 1 {
		t.Fatalf("untyped error was retried: attempts=%d", attempts)
	}
}

func TestExecuteWithRetrySetupFailureIsSafeBeforeDispatch(t *testing.T) {
	for _, testType := range []string{"database", "document", "cache", "queue"} {
		t.Run(testType, func(t *testing.T) {
			attempts := 0
			executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
				attempts++
				if attempts == 1 {
					return SetupFailure(syscall.ECONNREFUSED)
				}
				return nil
			})
			_, err := ExecuteWithRetry(context.Background(), executor, config.TestConfig{
				Type: testType, Config: map[string]any{"operation": "write", "query": "UPDATE accounts SET balance = 0"},
			}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
			if err != nil || attempts != 2 {
				t.Fatalf("setup failure was not safely retried: attempts=%d err=%v", attempts, err)
			}
		})
	}
}

func TestTypedDialFailureIsSafeBeforeHTTPDispatch(t *testing.T) {
	attempts := 0
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		attempts++
		if attempts == 1 {
			return OperationFailure(PhaseDispatch, &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED})
		}
		return nil
	})
	_, err := ExecuteWithRetry(context.Background(), executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "POST"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
	if err != nil || attempts != 2 {
		t.Fatalf("pre-dispatch dial failure was not retried: attempts=%d err=%v", attempts, err)
	}
}

func TestExecuteWithRetryDoesNotRetryAssertionOrDisabledPolicy(t *testing.T) {
	for _, tt := range []struct {
		name    string
		cfg     config.TestConfig
		err     error
		options RetryOptions
	}{
		{
			name: "assertion", cfg: config.TestConfig{Type: "http", Config: map[string]any{"method": "GET"}},
			err: AssertionFailure(errors.New("expected 200, got 503")),
		},
		{
			name: "configuration", cfg: config.TestConfig{Type: "http", Config: map[string]any{"method": "GET"}},
			err: ConfigurationFailure(errors.New("missing service")),
		},
		{
			name: "timeout", cfg: config.TestConfig{Type: "http", Config: map[string]any{"method": "GET"}},
			err: context.DeadlineExceeded,
		},
		{
			name: "cancellation", cfg: config.TestConfig{Type: "http", Config: map[string]any{"method": "GET"}},
			err: context.Canceled,
		},
		{
			name: "per test disabled", cfg: config.TestConfig{Type: "http", RetryPolicy: config.TestRetryPolicy{Mode: "never"}, Config: map[string]any{"method": "GET"}},
			err: OperationFailure(PhaseDispatch, syscall.ECONNRESET),
		},
		{
			name: "globally disabled", cfg: config.TestConfig{Type: "http", Config: map[string]any{"method": "GET"}},
			err: OperationFailure(PhaseDispatch, syscall.ECONNRESET), options: RetryOptions{Disabled: true},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			attempts := 0
			executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
				attempts++
				return tt.err
			})
			tt.options.Backoff = func() time.Duration { return 0 }
			_, _ = ExecuteWithRetry(context.Background(), executor, tt.cfg, nil, tt.options)
			if attempts != 1 {
				t.Fatalf("attempts=%d, want 1", attempts)
			}
		})
	}
}

func TestFinalAttemptRemainsPrimaryFailure(t *testing.T) {
	attemptNumber := 0
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		attemptNumber++
		if attemptNumber == 1 {
			return OperationFailure(PhaseDispatch, syscall.ECONNRESET)
		}
		return AssertionFailure(errors.New("expected 200, got 418"))
	})

	report, err := ExecuteWithRetry(context.Background(), executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "GET"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return 0 }})
	if ClassifyFailure(err).Class != FailureAssertion || len(report.Attempts) != 2 || report.Attempts[0].FailureClass != FailureTransientTransport || report.Attempts[1].FailureClass != FailureAssertion {
		t.Fatalf("final assertion did not remain primary: err=%v report=%#v", err, report)
	}
}

func TestRetrySafetyMatrix(t *testing.T) {
	for _, tt := range []struct {
		testType  string
		operation string
		safe      bool
	}{
		{"http", "GET", true}, {"http", "HEAD", true}, {"http", "OPTIONS", true}, {"http", "PUT", false},
		{"http", "POST", false}, {"http", "PATCH", false}, {"http", "DELETE", false},
		{"database", "SELECT", false},
		{"document", "find_one", true}, {"document", "find_many", true}, {"document", "count_documents", true}, {"document", "exists", true},
		{"document", "insert_one", false}, {"document", "update_one", false}, {"document", "delete_one", false},
		{"cache", "ping", true}, {"cache", "get", true}, {"cache", "exists", true},
		{"cache", "set", false}, {"cache", "delete", false}, {"cache", "del", false},
		{"queue", "check_topic", true}, {"queue", "list_topics", true},
		{"queue", "produce", false}, {"queue", "consume", false}, {"queue", "produce_and_consume", false},
		{"shell", "", false}, {"delay", "", false},
	} {
		cfg := config.TestConfig{Type: tt.testType, Config: map[string]any{"operation": tt.operation, "method": tt.operation}}
		if got := IsAutomaticallyRetrySafe(cfg); got != tt.safe {
			t.Errorf("%s/%s safe=%v, want %v", tt.testType, tt.operation, got, tt.safe)
		}
	}
}

func TestTypedTransientTransportReasons(t *testing.T) {
	for _, tt := range []struct {
		name string
		err  error
		code string
	}{
		{"connection reset", syscall.ECONNRESET, "TEST_TRANSPORT_CONNECTION_RESET"},
		{"connection refused", syscall.ECONNREFUSED, "TEST_TRANSPORT_CONNECTION_REFUSED"},
		{"broken pipe", syscall.EPIPE, "TEST_TRANSPORT_BROKEN_PIPE"},
		{"closed transport", net.ErrClosed, "TEST_TRANSPORT_CLOSED"},
		{"unexpected eof", io.ErrUnexpectedEOF, "TEST_TRANSPORT_UNEXPECTED_EOF"},
		{"eof", io.EOF, "TEST_TRANSPORT_EOF"},
		{"driver bad connection", driver.ErrBadConn, "TEST_TRANSPORT_BAD_CONNECTION"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			info := ClassifyFailure(OperationFailure(PhaseDispatch, tt.err))
			if info.Class != FailureTransientTransport || info.Phase != PhaseDispatch || info.Code != tt.code {
				t.Fatalf("unexpected typed classification: %#v", info)
			}
		})
	}
}

func TestExecuteWithRetryCancellationStopsBackoff(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		return OperationFailure(PhaseDispatch, syscall.ECONNRESET)
	})
	go func() {
		time.Sleep(10 * time.Millisecond)
		cancel()
	}()
	report, err := ExecuteWithRetry(ctx, executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "GET"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return time.Hour }})
	if !errors.Is(err, context.Canceled) || len(report.Attempts) != 1 || !report.Attempts[0].RetryScheduled {
		t.Fatalf("cancellation was not preserved: err=%v report=%#v", err, report)
	}
}

func TestExecuteWithRetryDeadlineStopsBackoff(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	executor := retryExecutorFunc(func(context.Context, config.TestConfig, *orchestrator.RuntimeRegsitry) error {
		return OperationFailure(PhaseDispatch, syscall.ECONNRESET)
	})
	report, err := ExecuteWithRetry(ctx, executor, config.TestConfig{
		Type: "http", Config: map[string]any{"method": "GET"},
	}, nil, RetryOptions{Backoff: func() time.Duration { return time.Hour }})
	if !errors.Is(err, context.DeadlineExceeded) || len(report.Attempts) != 1 || !report.Attempts[0].RetryScheduled {
		t.Fatalf("deadline was not preserved: err=%v report=%#v", err, report)
	}
}
