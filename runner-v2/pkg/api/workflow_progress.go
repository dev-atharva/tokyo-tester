package api

import (
	"context"

	"github.com/dev-atharva/cots/pkg/executionevent"
)

func withWorkflowProgressReporter(ctx context.Context, reporter executionevent.Reporter) context.Context {
	return executionevent.WithReporter(ctx, reporter)
}

func reportWorkflowProgress(ctx context.Context, stage, message string) {
	executionevent.Report(ctx, executionevent.Activity{
		Stage: executionevent.Stage(stage), Kind: "lifecycle", Status: "running", Message: message,
	})
}
