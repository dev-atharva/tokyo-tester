"use client";

import { useEffect, useMemo, useRef } from "react";
import { useExecutionStore } from "../stores/execution.store.sync";
import {
  type TestResult,
  useTestResultStore,
} from "../stores/test-result.store";

interface RealtimeTestListenerProps {
  onTestComplete?: (testResult: TestResult) => void;
  onAllTestsComplete?: (
    workflowRunId: string,
    summary: {
      total: number;
      passed: number;
      failed: number;
      duration: number;
    },
  ) => void;
  onError?: (error: string) => void;
}

export function useRealtimeTestResults({
  onTestComplete,
  onAllTestsComplete,
  onError: _onError,
}: RealtimeTestListenerProps = {}) {
  const activeWorkflowRunId = useExecutionStore((state) => state.activeWorkflowRunId);
  const executions = useExecutionStore((state) => state.executions);
  const activeExecution = useMemo(
    () =>
      activeWorkflowRunId ? executions[activeWorkflowRunId] ?? null : null,
    [activeWorkflowRunId, executions],
  );
  const allTestResults = useTestResultStore((state) => state.testResults);
  const workflowRunId = activeExecution?.workflowRunId ?? null;

  const testResults = useMemo(() => {
    if (!workflowRunId) {
      return [];
    }
    return Object.values(allTestResults).filter(
      (testResult) =>
        testResult.workflowRunId === workflowRunId && !testResult.is_deleted,
    );
  }, [allTestResults, workflowRunId]);

  const previousStatuses = useRef<Map<string, string>>(new Map());
  const notifiedRuns = useRef(new Set<string>());

  useEffect(() => {
    if (!activeExecution) {
      previousStatuses.current.clear();
      return;
    }

    for (const test of testResults) {
      const previousStatus = previousStatuses.current.get(test.id);
      if (previousStatus !== test.status) {
        previousStatuses.current.set(test.id, test.status);
        if (previousStatus && (test.status === "passed" || test.status === "failed")) {
          onTestComplete?.(test);
        }
      }
    }

    const allComplete =
      testResults.length > 0 &&
      testResults.every(
        (test) => test.status === "passed" || test.status === "failed",
      );
    if (allComplete && workflowRunId && !notifiedRuns.current.has(workflowRunId)) {
      const passed = testResults.filter((test) => test.status === "passed").length;
      const failed = testResults.filter((test) => test.status === "failed").length;
      onAllTestsComplete?.(workflowRunId, {
        total: testResults.length,
        passed,
        failed,
        duration: activeExecution.finishedAt
          ? activeExecution.finishedAt - activeExecution.startedAt
          : 0,
      });
      notifiedRuns.current.add(workflowRunId);
    }
  }, [activeExecution, onAllTestsComplete, onTestComplete, testResults, workflowRunId]);

  const summary = useMemo(
    () => ({
      total: testResults.length,
      passed: testResults.filter((test) => test.status === "passed").length,
      failed: testResults.filter((test) => test.status === "failed").length,
      running: testResults.filter((test) => test.status === "running").length,
      pending: testResults.filter((test) => test.status === "pending").length,
    }),
    [testResults],
  );

  return {
    activeSessionTestResults: testResults,
    summary,
    hasTests: testResults.length > 0,
    allComplete:
      testResults.length > 0 &&
      testResults.every(
        (test) => test.status === "passed" || test.status === "failed",
      ),
    hasFailures: summary.failed > 0,
    sessionId: workflowRunId,
    isActive: !!activeExecution,
  };
}
