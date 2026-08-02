package api

import (
	"fmt"

	"github.com/dev-atharva/cots/pkg/dto"
	"github.com/dev-atharva/cots/pkg/executionevent"
	testpkg "github.com/dev-atharva/cots/pkg/test"
)

func retryReportFields(report testpkg.ExecutionReport) ([]dto.TestAttempt, int64, bool) {
	attempts := make([]dto.TestAttempt, 0, len(report.Attempts))
	for _, attempt := range report.Attempts {
		attempts = append(attempts, dto.TestAttempt{
			Attempt: attempt.Attempt, Outcome: attempt.Outcome, DurationMs: attempt.DurationMs,
			FailureClass: string(attempt.FailureClass), FailureCode: attempt.FailureCode,
			Message: attempt.Message, RetryScheduled: attempt.RetryScheduled,
		})
	}
	return attempts, report.DurationMs, report.Recovered
}

func appendAttemptEvidence(diagnostic *executionevent.Diagnostic, attempts []dto.TestAttempt) {
	if diagnostic == nil || len(attempts) < 2 {
		return
	}
	for _, attempt := range attempts {
		message := fmt.Sprintf("Attempt %d %s", attempt.Attempt, attempt.Outcome)
		if attempt.FailureCode != "" {
			message += " (" + attempt.FailureCode + ")"
		}
		if attempt.Message != "" {
			message += ": " + attempt.Message
		}
		diagnostic.Evidence = append(diagnostic.Evidence, executionevent.Evidence{
			Kind: executionevent.EvidenceLifecycleEvent, Message: boundedDiagnosticEvidence(message),
		})
	}
}
