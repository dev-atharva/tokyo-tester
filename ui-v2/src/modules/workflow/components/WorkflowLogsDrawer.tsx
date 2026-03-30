"use client";

import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconLoader,
  IconTerminal,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import type { WorkflowExecution } from "../stores/execution.store.sync";

interface WorkflowLogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  execution: WorkflowExecution | null;
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

function statusBadge(status: string) {
  const safeStatus = status || "unknown";

  switch (safeStatus) {
    case "passed":
    case "completed":
      return (
        <Badge className="bg-green-600 text-white">
          <IconCircleCheck className="mr-1 size-3" />
          {safeStatus === "passed" ? "Passed" : "Completed"}
        </Badge>
      );
    case "failed":
    case "partial_failed":
      return (
        <Badge variant="destructive">
          <IconCircleX className="mr-1 size-3" />
          {safeStatus}
        </Badge>
      );
    case "pending":
    case "running":
      return (
        <Badge className="bg-blue-600 text-white">
          <IconLoader className="mr-1 size-3 animate-spin" />
          {safeStatus}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline">
          {safeStatus}
        </Badge>
      );
  }
}

export function WorkflowLogsDrawer({
  open,
  onOpenChange,
  execution,
}: WorkflowLogsDrawerProps) {
  const scenarioRunsMap = useScenarioRunStore((state) => state.scenarioRuns);
  const allResults = useTestResultStore((state) => state.testResults);

  const scenarioRuns = useMemo(() => {
    if (!execution) {
      return [];
    }
    return Object.values(scenarioRunsMap)
      .filter(
        (run) =>
          run.workflowRunId === execution.workflowRunId && !run.is_deleted,
      )
      .sort((left, right) => left.startedAt - right.startedAt);
  }, [execution, scenarioRunsMap]);

  const resultsByScenario = useMemo(() => {
    const map = new Map<string, typeof allResults[string][]>();
    if (!execution) {
      return map;
    }

    for (const result of Object.values(allResults)) {
      if (
        result.workflowRunId === execution.workflowRunId &&
        result.scenarioId &&
        !result.is_deleted
      ) {
        const existing = map.get(result.scenarioId) || [];
        existing.push(result);
        map.set(result.scenarioId, existing);
      }
    }

    return map;
  }, [allResults, execution]);

  if (!execution) {
    return null;
  }

  const duration = execution.finishedAt
    ? execution.finishedAt - execution.startedAt
    : Date.now() - execution.startedAt;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[88vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle className="flex items-center gap-2">
            Workflow Run {execution.workflowRunId.slice(0, 8)}...
            {statusBadge(execution.status)}
          </DrawerTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <IconClock className="size-4" />
            {Math.max(0, Math.floor(duration / 1000))}s elapsed
          </div>
        </DrawerHeader>

        <ScrollArea className="h-full px-5 py-5">
          <div className="space-y-6">
            <section className="space-y-2">
              <h3 className="font-medium">Workflow Logs</h3>
              <div className="rounded-lg border bg-muted/40 p-3">
                {execution.logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logs yet.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {execution.logs.map((log, index) => (
                      <div key={`${execution.workflowRunId}-${index}-${log.slice(0, 12)}`}>
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="font-medium">Scenario Runs</h3>
              {scenarioRuns.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Scenario runs will appear here once execution starts.
                </p>
              ) : (
                scenarioRuns.map((scenarioRun) => {
                  const results = resultsByScenario.get(scenarioRun.scenarioId) || [];
                  const scenarioStatus = deriveScenarioStatus(
                    results.map((result) => result.status),
                    scenarioRun.status,
                  );
                  return (
                    <div key={scenarioRun.id} className="rounded-lg border p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{scenarioRun.scenarioName}</div>
                          <div className="text-xs text-muted-foreground">
                            Backend session:{" "}
                            {scenarioRun.backendSessionId
                              ? `${scenarioRun.backendSessionId.slice(0, 8)}...`
                              : "pending"}
                          </div>
                        </div>
                        {statusBadge(scenarioStatus)}
                      </div>

                      {scenarioRun.logs.length > 0 && (
                        <div className="mb-3 rounded bg-muted/40 p-3 text-sm">
                          {scenarioRun.logs.map((log, index) => (
                            <div key={`${scenarioRun.id}-${index}-${log.slice(0, 12)}`}>
                              {log}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="space-y-2">
                        {results.map((result) => (
                          <div
                            key={result.id}
                            className="rounded border bg-background p-3 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="font-medium">{result.testName}</div>
                              {statusBadge(result.status)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {result.testType}
                            </div>
                            {getBackendError(result.resultData) && (
                              <div className="mt-2 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                                {getBackendError(result.resultData)}
                              </div>
                            )}
                            {result.containerLogs &&
                              Object.keys(result.containerLogs).length > 0 && (
                                <details className="mt-2">
                                  <summary className="cursor-pointer text-xs text-muted-foreground">
                                    <IconTerminal className="mr-1 inline size-3" />
                                    Container logs
                                  </summary>
                                  <pre className="mt-2 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-100">
                                    {JSON.stringify(result.containerLogs, null, 2)}
                                  </pre>
                                </details>
                              )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
