"use client";

import {
  IconClock,
  IconHistory,
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

interface ExecutionHistoryProps {
  workflowId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function statusBadge(status: string) {
  const safeStatus = status || "unknown";
  return (
    <Badge variant={safeStatus.includes("failed") ? "destructive" : "outline"}>
      {safeStatus}
    </Badge>
  );
}

function deriveScenarioStatus(
  statuses: string[],
  fallback?: string,
): string {
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

export const ExecutionHistory: React.FC<ExecutionHistoryProps> = ({
  workflowId,
  open,
  onOpenChange,
}) => {
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);

  const executionsMap = useExecutionStore((state) => state.executions);
  const clearExecution = useExecutionStore((state) => state.clearExecution);
  const scenarioRunsMap = useScenarioRunStore((state) => state.scenarioRuns);
  const testResultsMap = useTestResultStore((state) => state.testResults);

  const executions = useMemo(
    () =>
      Object.values(executionsMap)
        .filter((execution) => execution.workflowId === workflowId && !execution.is_deleted)
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
          run.workflowRunId === selectedExecution.workflowRunId && !run.is_deleted,
      )
      .sort((left, right) => left.startedAt - right.startedAt);
  }, [scenarioRunsMap, selectedExecution]);
  const selectedResultsByScenario = useMemo(() => {
    const grouped = new Map<string, Array<{ status: string; testName: string; error: string | null }>>();

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
      <DialogContent className="min-h-[90vh] min-w-[94vw] max-w-368  p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2">
            <IconHistory className="size-5" />
            Workflow Run History
          </DialogTitle>
          <DialogDescription>
            Review previous grouped workflow runs and their scenario children.
          </DialogDescription>
        </DialogHeader>

        <div className="grid h-full gap-4 overflow-hidden px-6 py-5 md:grid-cols-[360px_minmax(0,1fr)]">
          <ScrollArea className="h-full rounded-lg border p-3">
            <div className="space-y-2">
              {executions.map((execution) => (
                <button
                  type="button"
                  key={execution.workflowRunId}
                  onClick={() => setSelectedExecution(execution)}
                  className={`w-full rounded-lg border p-3 text-left ${
                    selectedExecution?.workflowRunId === execution.workflowRunId
                      ? "border-primary bg-primary/10"
                      : "hover:bg-muted"
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    {statusBadge(execution.status)}
                    <span className="text-xs text-muted-foreground">
                      {new Date(execution.startedAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm font-medium">
                    {execution.workflowRunId.slice(0, 8)}...
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>

          <div className="rounded-lg border p-4">
            {!selectedExecution ? (
              <div className="flex h-full min-h-75 items-center justify-center text-sm text-muted-foreground">
                Select a workflow run from the left.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">Workflow Run</div>
                    <div className="font-medium">
                      {selectedExecution.workflowRunId}
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => clearExecution(selectedExecution.workflowRunId)}
                  >
                    <IconTrash className="mr-1 size-4" />
                    Clear
                  </Button>
                </div>

                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconClock className="size-4" />
                  Started {new Date(selectedExecution.startedAt).toLocaleString()}
                </div>

                <div className="space-y-2">
                  <div className="font-medium">Scenario Runs</div>
                  {selectedScenarioRuns.map((scenarioRun) => (
                    <div key={scenarioRun.id} className="rounded border p-3">
                      {(() => {
                        const scenarioResults =
                          selectedResultsByScenario.get(scenarioRun.scenarioId) || [];
                        const failedResult = scenarioResults.find(
                          (result) => result.status === "failed" && result.error,
                        );

                        return (
                          <>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <div className="font-medium">{scenarioRun.scenarioName}</div>
                        {statusBadge(
                          deriveScenarioStatus(
                            scenarioResults.map((result) => result.status),
                            scenarioRun.status,
                          ),
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Backend session: {scenarioRun.backendSessionId || "pending"}
                      </div>
                      {failedResult && (
                        <div className="mt-2 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                          {failedResult.testName}: {failedResult.error}
                        </div>
                      )}
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
