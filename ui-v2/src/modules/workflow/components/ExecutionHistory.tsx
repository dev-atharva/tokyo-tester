"use client";

import {
  IconCheck,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconHistory,
  IconLoader,
  IconTrash,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";
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
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import {
  type WorkflowExecution,
  useExecutionStore,
} from "../stores/execution.store.sync";
import { cn } from "@/lib/utils";

interface ExecutionHistoryProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusBadge(status: string) {
  const safeStatus = status || "unknown";
  switch (safeStatus) {
    case "passed":
    case "completed":
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium shadow-sm">
          <IconCircleCheck className="mr-1.5 size-3.5" />
          {safeStatus === "passed" ? "Passed" : "Completed"}
        </Badge>
      );
    case "failed":
    case "partial_failed":
      return (
        <Badge variant="destructive" className=" font-medium shadow-sm">
          <IconCircleX className="mr-1.5 size-3.5" />
          {safeStatus === "failed" ? "Failed" : "Partial Failed"}
        </Badge>
      );
    case "pending":
    case "running":
      return (
        <Badge className=" bg-blue-500 hover:bg-blue-600 text-white font-medium shadow-sm">
          <IconLoader className="mr-1.5 size-3.5 animate-spin" />
          {safeStatus === "pending" ? "Pending" : "Running"}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className=" font-medium">
          {safeStatus}
        </Badge>
      );
  }
}

function deriveScenarioStatus(statuses: string[], fallback?: string): string {
  if (statuses.length === 0) {
    return fallback && fallback !== "unknown" ? fallback : "pending";
  }

  if (statuses.some((status) => status === "failed")) {
    return "failed";
  }

  if (statuses.every((status) => status === "passed")) {
    return "completed";
  }

  return "running";
}

function getBackendError(resultData: unknown): string | null {
  if (!resultData || typeof resultData !== "object") {
    return null;
  }

  if ("error" in resultData && typeof resultData.error === "string") {
    return resultData.error;
  }

  if ("message" in resultData && typeof resultData.message === "string") {
    return resultData.message;
  }

  return null;
}

function renderErrorPanel(title: string, message: string) {
  return (
    <div className=" rounded-lg border border-red-50/80 dark:bg-red-950/20 dark:border-red-800/500 p-3">
      <div className="flex items-start gap-2">
        <IconCircleX className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="text-xs font-semibold text-red-900 dark:text-red-200 ">
            {title}
          </div>
          <div className="text-xs text-red-700 dark:text-red-300 leading-relaxed whitespace-pre-wrap">
            {message}
          </div>
        </div>
      </div>
    </div>
  );
}

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  workflowId,
  open,
  onOpenChange,
}) => {
  const [selectedExecution, setSelectedExecution] =
    useState<WorkflowExecution | null>(null);

  const executionsMap = useExecutionStore((state) => state.executions);
  const clearExecution = useExecutionStore((state) => state.clearExecution);
  const scenarioRunsMap = useScenarioRunStore((state) => state.scenarioRuns);
  const testResultsMap = useTestResultStore((state) => state.testResults);

  const executions = useMemo(
    () =>
      Object.values(executionsMap)
        .filter(
          (execution) =>
            execution.workflowId === workflowId && !execution.is_deleted,
        )
        .sort((left, right) => right.startedAt - left.startedAt),
    [executionsMap, workflowId],
  );
  const selectedScenarioRuns = useMemo(() => {
    if (!selectedExecution) {
      return [];
    }

    return Object.values(scenarioRunsMap)
      .filter(
        (run) =>
          run.workflowRunId === selectedExecution.workflowRunId &&
          !run.is_deleted,
      )
      .sort((left, right) => left.startedAt - right.startedAt);
  }, [scenarioRunsMap, selectedExecution]);
  const selectedResultsByScenario = useMemo(() => {
    const grouped = new Map<
      string,
      Array<{ status: string; testName: string; error: string | null }>
    >();

    if (!selectedExecution) {
      return grouped;
    }

    for (const result of Object.values(testResultsMap)) {
      if (
        result.workflowRunId === selectedExecution.workflowRunId &&
        result.scenarioId &&
        !result.is_deleted
      ) {
        const existing = grouped.get(result.scenarioId) || [];
        existing.push({
          status: result.status,
          testName: result.testName,
          error: getBackendError(result.resultData),
        });
        grouped.set(result.scenarioId, existing);
      }
    }

    return grouped;
  }, [selectedExecution, testResultsMap]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className=" flex flex-col h-[80vh] min-w-[80vw] max-w-368  p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className=" flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <IconHistory className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Workflow Run History
                </DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Review previous workflow executions
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="grid h-full gap-5 overflow-hidden px-6 py-5 md:grid-cols-[360px_minmax(0,1fr)]">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className=" text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                Recent Runs
              </h3>
              <span className="text-xs text-muted-foreground font-medium">
                {executions.length} total
              </span>
            </div>
            <ScrollArea className="h-full rounded-xl border border-border/60 bg-muted/20 shadow-sm">
              <div className="space-y-2 p-3">
                {executions.length === 0 ? (
                  <div className="flex items-center justify-center py-12 text-sm text-muted-foreground italic">
                    No execution history yet
                  </div>
                ) : (
                  executions.map((execution) => {
                    const isSelected =
                      selectedExecution?.workflowRunId ===
                      execution.workflowRunId;
                    const duration = execution.finishedAt
                      ? execution.finishedAt - execution.startedAt
                      : Date.now() - execution.startedAt;
                    return (
                      <button
                        type="button"
                        key={execution.workflowRunId}
                        onClick={() => setSelectedExecution(execution)}
                        className={cn(
                          "w-full rounded-lg border p-4 text-left transition-all duration-200",
                          isSelected
                            ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                            : "border-border/60 bg-background hover:bg-muted/50 hover:shadow-sm hover:border-border",
                        )}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          {statusBadge(execution.status)}
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {new Date(
                                execution.startedAt,
                              ).toLocaleDateString()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(
                                execution.startedAt,
                              ).toLocaleTimeString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <code className="text-xs font-mono font-medium bg-muted/60 px-2 py-1 rounded">
                            {execution.workflowRunId.slice(0, 12)}
                          </code>
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <IconCheck className="size-3.5" />
                            <span>{Math.floor(duration / 1000)}s</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
              Execution Details
            </h3>
            <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
              {!selectedExecution ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
                  <div className="p-3 rounded-full bg-muted/50">
                    <IconHistory className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground/80">
                      No execution selected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Select a workflow run from the list to view details
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="p-4 border-b bg-muted/20 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Workflow Run ID
                        </div>
                        <code className="block text-sm font-mono font-semibold bg-muted/60 px-3 py-2 rounded-lg truncate">
                          {selectedExecution.workflowRunId}
                        </code>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          clearExecution(selectedExecution.workflowRunId);
                          setSelectedExecution(null);
                        }}
                        className="shadow-sm"
                      >
                        <IconTrash className=" mr-2 size-4" />
                        Delete
                      </Button>
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-background/80 border">
                        <IconClock className="size-4 text-muted-foreground" />
                        <span className="font-medium">
                          {new Date(
                            selectedExecution.startedAt,
                          ).toLocaleString()}
                        </span>
                      </div>
                      {statusBadge(selectedExecution.status)}
                    </div>
                    {selectedExecution.error &&
                      renderErrorPanel(
                        "Workflow Error",
                        selectedExecution.error,
                      )}
                  </div>

                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                          Scenario Runs
                        </h4>
                        <span className="text-xs text-muted-foreground font-medium">
                          {selectedScenarioRuns.length} scenarios
                        </span>
                      </div>

                      {selectedScenarioRuns.length === 0 ? (
                        <div className="flex items-center justify-center py-12 rounded-lg border border-dashed border-border/60">
                          <p className="text-sm text-muted-foreground italic">
                            No scenario runs found
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {selectedScenarioRuns.map((scenarioRun) => {
                            const scenarioResults =
                              selectedResultsByScenario.get(
                                scenarioRun.scenarioId,
                              ) || [];
                            const failedResults = scenarioResults.filter(
                              (result) =>
                                result.status === "failed" && result.error,
                            );
                            const passedCount = scenarioResults.filter(
                              (r) => r.status === "passed",
                            ).length;
                            const scenarioError =
                              scenarioRun.error?.trim() || null;

                            const totalCount = scenarioResults.length;

                            return (
                              <div
                                key={scenarioRun.id}
                                className="rounded-lg border border-border/50 bg-background/50 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden"
                              >
                                <div className="p-4 space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-semibold text-sm mb-2 truncate">
                                        {scenarioRun.scenarioName}
                                      </h5>
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <span className="font-medium">
                                          Session:
                                        </span>
                                        <code className="px-1.5 py-0.5 rounded bg-muted/60 font-mono">
                                          {scenarioRun.backendSessionId
                                            ? scenarioRun.backendSessionId.slice(
                                                0,
                                                8,
                                              )
                                            : "pending"}
                                        </code>
                                      </div>
                                    </div>
                                    {statusBadge(
                                      deriveScenarioStatus(
                                        scenarioResults.map(
                                          (result) => result.status,
                                        ),
                                        scenarioRun.status,
                                      ),
                                    )}
                                  </div>

                                  {totalCount > 0 && (
                                    <div className="space-y-1">
                                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                        <div
                                          style={{
                                            width: `${(passedCount / totalCount) * 100}%`,
                                          }}
                                          className=" h-full  bg-emerald-500 transition-all duration-300"
                                        ></div>
                                        <span className=" text-xs font-medium text-muted-foreground">
                                          {passedCount}/{totalCount} passed
                                        </span>
                                      </div>
                                    </div>
                                  )}

                                  {scenarioError &&
                                    renderErrorPanel(
                                      "Scenario Error",
                                      scenarioError,
                                    )}

                                  {failedResults.length > 0 && (
                                    <div className="space-y-2 pt-2 border-t">
                                      <div className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide">
                                        Failed Tests
                                      </div>
                                      {failedResults.map(
                                        (failedResult, idx) => (
                                          <div key={idx}>
                                            {renderErrorPanel(
                                              failedResult.testName,
                                              failedResult.error || "",
                                            )}
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
