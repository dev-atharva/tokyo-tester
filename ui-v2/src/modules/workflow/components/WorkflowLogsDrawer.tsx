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

function statusBadge(status: string) {
  const safeStatus = status || "unknown";

  switch (safeStatus) {
    case "passed":
    case "completed":
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-medium shadow-sm">
          <IconCircleCheck className="mr-1.5 size-3.5 " />
          {safeStatus === "passed" ? "Passed" : "Completed"}
        </Badge>
      );
    case "failed":
    case "partial_failed":
      return (
        <Badge variant="destructive" className="font-medium shadow-sm">
          <IconCircleX className="mr-1.5 size-3.5" />
          {safeStatus}
        </Badge>
      );
    case "pending":
    case "running":
      return (
        <Badge className="bg-blue-500 hover:bg-blue-500 text-white font-medium shadow-sm">
          <IconLoader className="mr-1.5 size-3.5 animate-spin" />
          {safeStatus === "pending" ? "Pending" : "Running"}
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="font-medium">
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
    const map = new Map<string, (typeof allResults)[string][]>();
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
        <DrawerHeader className="border-b bg-muted/30 pb-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <DrawerTitle className="flex items-center text-xl font-semibold gap-3">
                <span className="text-muted-foreground font-mono text-sm">
                  {execution.workflowRunId.slice(0, 8)}
                </span>
                {statusBadge(execution.status)}
              </DrawerTitle>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconClock className="size-4" />
                <span className="font-medium">
                  {Math.max(0, Math.floor(duration / 1000))}s
                </span>
                <span className="text-xs">elapsed</span>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <ScrollArea className="h-screen overflow-y-auto px-6 py-6">
          <div className="space-y-8">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                Workflow Logs
              </h3>
              <div className="rounded-lg border border-border/60 bg-muted/30 shadow-sm">
                {execution.logs.length === 0 ? (
                  <div className="flex items-center justify-center py-8">
                    <p className="text-sm text-muted-foreground italic">
                      No logs yet.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 py-4 font-mono text-xs leading-relaxed max-h-48 overflow-y-auto">
                    {execution.logs.map((log, index) => (
                      <div
                        key={`${execution.workflowRunId}-${index}-${log.slice(0, 12)}`}
                        className="text-foreground/80 hover:text-foreground hover:bg-muted/50 px-2 py-1 rounded transition-colors"
                      >
                        {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                Scenario Runs
              </h3>
              {scenarioRuns.length === 0 ? (
                <div className="flex items-center justify-center py-12 rounded-lg border border-dashed border-border/60">
                  <p className="text-sm text-muted-foreground italic">
                    Scenario runs will appear here once execution starts
                  </p>
                </div>
              ) : (
                <div className="space-y-4 pr-2">
                  {scenarioRuns.map((scenarioRun) => {
                    const results =
                      resultsByScenario.get(scenarioRun.scenarioId) || [];
                    const scenarioStatus = deriveScenarioStatus(
                      results.map((result) => result.status),
                      scenarioRun.status,
                    );

                    return (
                      <div
                        key={scenarioRun.id}
                        className="rounded-xl border border-border/60 bg-card shadow-sm hover:shadow-md transition-all duration-200"
                      >
                        <div className="p-5 pb-4 border-4 bg-muted/20">
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-base mb-1.5 truncate">
                              {scenarioRun.scenarioName}
                            </h4>
                            <div className=" flex items-center gap-2 text-xs text-muted-foreground">
                              <span className="font-medium">Session:</span>
                              <code className="px-1.5 py-0.5 rounded bg-muted/60 font-mono">
                                {scenarioRun.backendSessionId
                                  ? `${scenarioRun.backendSessionId.slice(0, 8)}`
                                  : "pending"}
                              </code>
                            </div>
                          </div>
                          {statusBadge(scenarioStatus)}
                        </div>

                        {scenarioRun.logs.length > 0 && (
                          <div className="px-5 py-3 border-b bg-muted/10">
                            <div className=" font-mono text-xs space-y-1 max-h-32 overflow-y-auto">
                              {scenarioRun.logs.map((log, index) => (
                                <div
                                  key={`${scenarioRun.id}-${index}-${log.slice(0, 12)}`}
                                  className="text-foreground/70 hover:text-foreground px-2 py-0.5 rounded hover:bg-muted/30 transition-colors"
                                >
                                  {log}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="p-5 space-y-2">
                          {results.length === 0 ? (
                            <div className="text-center py-6 text-sm text-muted-foreground italic">
                              No test results yet
                            </div>
                          ) : (
                            results.map((result) => (
                              <div
                                key={result.id}
                                className="rounded-lg border border-border/50 bg-background/50 transition-colors"
                              >
                                <div className=" flex items-start justify-between gap-3 mb-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium text-sm mb-1 truncate">
                                      {result.testName}
                                    </div>
                                    <div className="inline-flex items-center gap-1.5 py-0.5 rounded-md bg-muted/60 text-xs text-muted-foreground font-medium">
                                      {result.testType}
                                    </div>
                                  </div>
                                  {statusBadge(result.status)}
                                </div>
                                {getBackendError(result.resultData) && (
                                  <div className="mt-3 rounded-lg border border-red-200/80 dark:border-red-800/50 p-3">
                                    <div className="flex items-center gap-2">
                                      <IconCircleX className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                                      <div className="text-sm text-red-700 dark:text-red-300 font-medium leading-relaxed">
                                        {getBackendError(result.resultData)}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {result.containerLogs &&
                                  Object.keys(result.containerLogs).length >
                                    0 && (
                                    <details className="mt-3 group">
                                      <summary className="cursor-pointer flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors select-none">
                                        <IconTerminal className="size-3.5" />
                                        <span>Containeer Logs</span>
                                        <span className="ml-auto text-[10px] opacity-50">
                                          Click to expand
                                        </span>
                                      </summary>
                                      <pre className="mt-3 overflow-auto rounded-lg bg-slate-950 dark:bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100 border-slate-800 shadow-inner max-h-64">
                                        {JSON.stringify(
                                          result.containerLogs,
                                          null,
                                          2,
                                        )}
                                      </pre>
                                    </details>
                                  )}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
