"use client";

import {
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconHistory,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useTestResultStore } from "@/modules/workflow/stores/test-result.store";
import {
  useExecutionStore,
  type WorkflowExecution,
} from "../stores/execution.store.sync";

interface ExecutionHistoryProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  workflowId,
  open,
  onOpenChange,
}) => {
  const [selectedExecution, setSelectedExecution] =
    useState<WorkflowExecution | null>(null);
  const [isListCollapsed, setIsListCollapsed] = useState(false);

  const executionsMap = useExecutionStore((s) => s.executions);
  const clearExecution = useExecutionStore((s) => s.clearExecution);

  const executions = useMemo(() => {
    return Object.values(executionsMap).filter(
      (e) => e.workflowId === workflowId && !e.is_deleted,
    );
  }, [executionsMap, workflowId]);

  const sortedExecutions = useMemo(() => {
    return [...executions].sort((a, b) => b.startedAt - a.startedAt);
  }, [executions]);

  const getTestResultsBySession = useTestResultStore(
    (s) => s.getTestResultsBySession,
  );

  /* ---------------------- Derived Execution Status ----------------------- */

  const executionStatusMap = useMemo(() => {
    const map = new Map<string, WorkflowExecution["status"]>();
    executions.forEach((execution) => {
      const tests = getTestResultsBySession(execution.sessionId);
      if (!tests || tests.length === 0) {
        map.set(execution.sessionId, execution.status);
        return;
      }

      if (tests.some((t) => t.status === "failed")) {
        map.set(execution.sessionId, "failed");
      } else if (tests.some((t) => t.status === "running")) {
        map.set(execution.sessionId, "running");
      } else if (tests.every((t) => t.status === "passed")) {
        map.set(execution.sessionId, "completed");
      }
    });
    return map;
  }, [executions, getTestResultsBySession]);

  const getExecutionStatusFromTests = useCallback(
    (execution: WorkflowExecution): WorkflowExecution["status"] => {
      return executionStatusMap.get(execution.sessionId) ?? execution.status;
    },
    [executionStatusMap],
  );

  const selectedExecutionStatus = useMemo(() => {
    if (!selectedExecution) return null;
    return getExecutionStatusFromTests(selectedExecution);
  }, [selectedExecution, getExecutionStatusFromTests]);

  /* ---------------------------- Test Results ----------------------------- */

  const testResults = useMemo(() => {
    if (!selectedExecution) return [];
    return getTestResultsBySession(selectedExecution.sessionId);
  }, [selectedExecution, getTestResultsBySession]);

  const testSummary = useMemo(() => {
    const summary = {
      total: testResults.length,
      passed: 0,
      failed: 0,
      running: 0,
      pending: 0,
    };

    for (const test of testResults) {
      if (test.status === "passed") summary.passed++;
      else if (test.status === "failed") summary.failed++;
      else if (test.status === "running") summary.running++;
      else if (test.status === "pending") summary.pending++;
    }

    return summary;
  }, [testResults]);

  /* ----------------------------- Utilities ------------------------------ */

  const formatExecutionDuration = (startedAt: number, updatedAt?: string) => {
    if (!updatedAt) return "Running...";

    const end = new Date(updatedAt).getTime();
    const durationMs = end - startedAt;

    if (durationMs <= 0) return "0s";

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);

    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }

    return `${seconds}s`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusBadge = (status: WorkflowExecution["status"]) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-primary">
            <IconCheck className="mr-1 size-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <IconX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary">
            <IconClock className="mr-1 size-3" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTestStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
        return (
          <Badge className="bg-green-500">
            <IconCheck className="mr-1 size-3" />
            Passed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <IconX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary">
            <IconClock className="mr-1 size-3" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  /* ------------------------------ Render ------------------------------- */

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw]! h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <IconHistory className="size-5" />
            Execution History
          </DialogTitle>
          <DialogDescription>
            View and manage past workflow executions
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[calc(90vh-5rem)] overflow-hidden">
          {/* ----------------------- Execution List ----------------------- */}
          <div
            className={cn(
              "relative transition-all duration-300 border-r bg-muted/30",
              isListCollapsed ? "w-0" : "w-80",
            )}
          >
            <Button
              variant="outline"
              size="icon"
              className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-6"
              onClick={() => setIsListCollapsed(!isListCollapsed)}
            >
              {isListCollapsed ? (
                <IconChevronRight className="size-4" />
              ) : (
                <IconChevronLeft className="size-4" />
              )}
            </Button>

            {!isListCollapsed && (
              <ScrollArea className="h-full p-4">
                <div className="space-y-2">
                  {sortedExecutions.map((execution) => {
                    const status = getExecutionStatusFromTests(execution);
                    const tests = getTestResultsBySession(execution.sessionId);

                    return (
                      <button
                        type="button"
                        key={execution.sessionId}
                        onClick={() => setSelectedExecution(execution)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left",
                          selectedExecution?.sessionId === execution.sessionId
                            ? "border-primary bg-primary/10"
                            : "hover:bg-muted/50",
                        )}
                      >
                        <div className="flex justify-between mb-2">
                          {getStatusBadge(status)}
                          <span className="text-xs text-muted-foreground">
                            {formatExecutionDuration(
                              execution.startedAt,
                              execution.updated_at,
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(execution.startedAt)}
                        </p>
                        {tests.length > 0 && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tests.length} test
                            {tests.length !== 1 ? "s" : ""}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </div>

          {/* ---------------------- Execution Details ---------------------- */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-6">
                {selectedExecution ? (
                  <>
                    <div className="flex justify-between mb-6">
                      <div>
                        <h3 className="font-semibold text-lg">
                          Execution Details
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {formatTimestamp(selectedExecution.startedAt)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          clearExecution(selectedExecution.sessionId);
                          setSelectedExecution(null);
                        }}
                      >
                        <IconTrash className="mr-2 size-4" />
                        Delete
                      </Button>
                    </div>

                    <Separator />

                    <div className="mt-6 space-y-6">
                      <div>
                        <h4 className="font-medium mb-2">Status</h4>
                        {selectedExecutionStatus &&
                          getStatusBadge(selectedExecutionStatus)}
                      </div>
                      {testSummary.total > 0 && (
                        <>
                          <Separator />

                          <div>
                            <h4 className="font-medium mb-3">Test Summary</h4>

                            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                              <div className="rounded-lg border p-3 text-center">
                                <div className="text-lg font-semibold">
                                  {testSummary.total}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Total
                                </div>
                              </div>

                              <div className="rounded-lg border p-3 text-center">
                                <div className="text-lg font-semibold text-green-600">
                                  {testSummary.passed}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Passed
                                </div>
                              </div>

                              <div className="rounded-lg border p-3 text-center">
                                <div className="text-lg font-semibold text-red-600">
                                  {testSummary.failed}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Failed
                                </div>
                              </div>

                              <div className="rounded-lg border p-3 text-center">
                                <div className="text-lg font-semibold text-yellow-600">
                                  {testSummary.running}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Running
                                </div>
                              </div>

                              <div className="rounded-lg border p-3 text-center">
                                <div className="text-lg font-semibold text-gray-600">
                                  {testSummary.pending}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Pending
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      )}

                      {testResults.length > 0 && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="font-medium mb-2">Test Results</h4>
                            <div className="space-y-2">
                              {testResults.map((test) => (
                                <div
                                  key={test.id}
                                  className="rounded-lg border p-4 space-y-3"
                                >
                                  {/* Header */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      <h5 className="font-medium">
                                        {test.testName}
                                      </h5>
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {test.testType}
                                      </Badge>
                                    </div>
                                    {getTestStatusBadge(test.status)}
                                  </div>

                                  {/* Meta */}
                                  <div className="text-xs text-muted-foreground">
                                    Duration: {test.durationMs}ms
                                  </div>

                                  {/* Result Data */}
                                  {test.resultData && (
                                    <details className="group">
                                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                        View result data
                                      </summary>
                                      <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs font-mono">
                                        {JSON.stringify(
                                          test.resultData,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </details>
                                  )}

                                  {/* Logs */}
                                  {test.containerLogs &&
                                    Object.keys(test.containerLogs).length >
                                      0 && (
                                      <details className="group">
                                        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                                          View container logs (
                                          {
                                            Object.keys(test.containerLogs)
                                              .length
                                          }
                                          )
                                        </summary>

                                        <div className="mt-2 max-h-64 overflow-auto rounded bg-muted p-3 space-y-4">
                                          {Object.entries(
                                            test.containerLogs,
                                          ).map(([containerName, logs]) => (
                                            <div
                                              key={containerName}
                                              className="space-y-2"
                                            >
                                              {/* Container Header */}
                                              <div className="text-xs font-semibold text-primary">
                                                [{containerName}]
                                              </div>

                                              {/* Log Content */}
                                              <pre className="font-mono text-xs whitespace-pre-wrap wrap-break-word bg-background p-2 rounded border">
                                                {logs}
                                              </pre>
                                            </div>
                                          ))}
                                        </div>
                                      </details>
                                    )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground">
                    Select an execution to view details
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
