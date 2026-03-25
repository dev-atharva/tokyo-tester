"use client";

import { useEffect, useRef, useMemo } from "react";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useTestResultStore } from "../stores/test-result.store";

interface RealtimeTestListenerProps {
  onTestComplete?: (testResult: any) => void;
  onAllTestsComplete?: (sessionId: string, summary: any) => void;
  onError?: (error: string) => void;
}

/**
 * Hook to listen for real-time test result updates
 * This monitors the test result store for changes and triggers callbacks
 */
export function useRealtimeTestResults({
  onTestComplete,
  onAllTestsComplete,
  onError,
}: RealtimeTestListenerProps = {}) {
  // Get active execution
  const activeExecution = useExecutionStore((s) => s.getActiveExecution());

  // Get sessionId separately for stable reference
  const sessionId = activeExecution?.sessionId ?? null;

  // Subscribe to all test results (the raw object)
  const allTestResults = useTestResultStore((s) => s.testResults);

  // Memoize filtered results to prevent infinite loops
  const testResults = useMemo(() => {
    if (!sessionId) return [];
    return Object.values(allTestResults).filter(
      (tr) => tr.sessionId === sessionId && !tr.is_deleted,
    );
  }, [allTestResults, sessionId]);

  // Track previous state
  const previousTestStatesRef = useRef<Map<string, string>>(new Map());
  const notifiedSessionsRef = useRef(new Set<string>());
  const sessionIdRef = useRef<string | null>(null);
  const previousExecutionStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!activeExecution) {
      previousTestStatesRef.current.clear();
      sessionIdRef.current = null;
      previousExecutionStatusRef.current = null;
      return;
    }

    if (sessionIdRef.current !== activeExecution.sessionId) {
      previousTestStatesRef.current.clear();
      sessionIdRef.current = activeExecution.sessionId;
      previousExecutionStatusRef.current = activeExecution.status;
    }
  }, [activeExecution?.sessionId]);

  // Reset when session changes
  useEffect(() => {
    if (!activeExecution) {
      previousTestStatesRef.current.clear();
      sessionIdRef.current = null;
      return;
    }

    // If session changed, reset state
    if (sessionIdRef.current !== activeExecution.sessionId) {
      console.log(
        `[RealtimeTests] Session changed: ${sessionIdRef.current} -> ${activeExecution.sessionId}`,
      );
      previousTestStatesRef.current.clear();
      sessionIdRef.current = activeExecution.sessionId;
    }
  }, [activeExecution?.sessionId]);

  // Monitor test result changes
  useEffect(() => {
    if (!activeExecution || testResults.length === 0) {
      return;
    }

    const currentSessionId = activeExecution.sessionId;

    // Process each test result
    testResults.forEach((test) => {
      const previousStatus = previousTestStatesRef.current.get(test.id);

      // New test or status changed
      if (!previousStatus) {
        // Brand new test
        console.log(
          `[RealtimeTests] New test detected: ${test.testName} - ${test.status}`,
        );
        previousTestStatesRef.current.set(test.id, test.status);

        // Only trigger callback for non-pending initial states
        if (test.status !== "pending") {
          onTestComplete?.(test);
        }
      } else if (previousStatus !== test.status) {
        // Status changed
        console.log(
          `[RealtimeTests] Test status changed: ${test.testName} ${previousStatus} -> ${test.status}`,
        );
        previousTestStatesRef.current.set(test.id, test.status);
        onTestComplete?.(test);
      }
    });

    // Check if all tests are complete (passed or failed)
    const allComplete = testResults.every(
      (t) => t.status === "passed" || t.status === "failed",
    );

    const hasTests = testResults.length > 0;
    const executionCompleted = activeExecution.status === "completed";
    const notAlreadyNotified =
      !notifiedSessionsRef.current.has(currentSessionId);

    const justCompleted =
      executionCompleted &&
      previousExecutionStatusRef.current !== "completed" &&
      previousExecutionStatusRef.current !== null;

    if (allComplete && hasTests && justCompleted && notAlreadyNotified) {
      const passed = testResults.filter((t) => t.status === "passed").length;
      const failed = testResults.filter((t) => t.status === "failed").length;

      const summary = {
        total: testResults.length,
        passed,
        failed,
        duration: activeExecution.finishedAt
          ? activeExecution.finishedAt - activeExecution.startedAt
          : 0,
      };

      console.log(
        `[RealtimeTests] All tests complete for session ${currentSessionId}:`,
        summary,
      );

      onAllTestsComplete?.(currentSessionId, summary);
      notifiedSessionsRef.current.add(currentSessionId);
    }
  }, [testResults, activeExecution, onTestComplete, onAllTestsComplete]);

  // Cleanup old notifications to prevent memory leak
  useEffect(() => {
    const interval = setInterval(() => {
      if (notifiedSessionsRef.current.size > 10) {
        const sessions = Array.from(notifiedSessionsRef.current);
        notifiedSessionsRef.current = new Set(sessions.slice(-10));
        console.log("[RealtimeTests] Cleaned up old session notifications");
      }
    }, 60000); // Clean up every minute

    return () => clearInterval(interval);
  }, []);

  // Compute summary stats - memoized to prevent unnecessary recalculations
  const summary = useMemo(
    () => ({
      total: testResults.length,
      passed: testResults.filter((t) => t.status === "passed").length,
      failed: testResults.filter((t) => t.status === "failed").length,
      running: testResults.filter((t) => t.status === "running").length,
      pending: testResults.filter((t) => t.status === "pending").length,
    }),
    [testResults],
  );

  // Memoize other computed values
  const hasTests = testResults.length > 0;
  const allComplete = useMemo(
    () =>
      testResults.every((t) => t.status === "passed" || t.status === "failed"),
    [testResults],
  );
  const hasFailures = summary.failed > 0;

  return {
    // Active session test results
    activeSessionTestResults: testResults,

    // Summary statistics
    summary,

    // Helper flags
    hasTests,
    allComplete,
    hasFailures,

    // Active execution info
    sessionId: activeExecution?.sessionId ?? null,
    isActive: !!activeExecution,
  };
}
