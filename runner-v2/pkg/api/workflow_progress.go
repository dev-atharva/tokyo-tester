package api

import "context"

type workflowProgressReporter func(stage, message string)

type workflowProgressContextKey struct{}

func withWorkflowProgressReporter(ctx context.Context, reporter workflowProgressReporter) context.Context {
	if reporter == nil {
		return ctx
	}
	return context.WithValue(ctx, workflowProgressContextKey{}, reporter)
}

func reportWorkflowProgress(ctx context.Context, stage, message string) {
	reporter, _ := ctx.Value(workflowProgressContextKey{}).(workflowProgressReporter)
	if reporter != nil {
		reporter(stage, message)
	}
}
