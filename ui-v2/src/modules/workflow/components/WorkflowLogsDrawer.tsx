"use client";

import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconFileText,
  IconHistory,
  IconLoader,
  IconTerminal,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { WorkflowExecution } from "../stores/execution.store.sync";
import { useTestResultStore } from "../stores/test-result.store";

interface WorkflowLogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  execution: WorkflowExecution | null;
}

export function WorkflowLogsDrawer({
  open,
  onOpenChange,
  execution,
}: WorkflowLogsDrawerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null);

  const sessionId = execution?.sessionId ?? null;

  const getTestResultsBySession = useTestResultStore(
    (s) => s.getTestResultsBySession,
  );

  const testResults = useMemo(() => {
    return sessionId ? getTestResultsBySession(sessionId) : [];
  }, [sessionId, getTestResultsBySession]);

  // Derived execution status based on test results
  const executionStatus = useMemo(() => {
    if (!execution) return "idle";

    if (testResults.length === 0) return execution.status;

    if (testResults.some((t) => t.status === "failed")) return "failed";
    if (testResults.some((t) => t.status === "running")) return "running";
    if (testResults.every((t) => t.status === "passed")) return "completed";

    return execution.status;
  }, [execution, testResults]);

  // Badge for execution status
  const getExecutionStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-600 text-white dark:bg-green-500 shrink-0">
            <IconCircleCheck className="mr-1 size-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="shrink-0">
            <IconCircleX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-600 text-white dark:bg-blue-500 shrink-0">
            <IconLoader className="mr-1 size-3 animate-spin" />
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="shrink-0">
            {status}
          </Badge>
        );
    }
  };

  const getTestStatusBadge = (status: string) => {
    switch (status) {
      case "passed":
        return (
          <Badge className="bg-green-600 text-white dark:bg-green-500 shrink-0">
            <IconCircleCheck className="mr-1 size-3" />
            Passed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive" className="shrink-0">
            <IconCircleX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge className="bg-blue-600 text-white dark:bg-blue-500 shrink-0">
            <IconLoader className="mr-1 size-3 animate-spin" />
            Running
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="shrink-0">
            {status}
          </Badge>
        );
    }
  };

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, []);

  if (!execution) return null;

  const duration = execution.finishedAt
    ? execution.finishedAt - execution.startedAt
    : Date.now() - execution.startedAt;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2 min-w-0 flex-1">
              <DrawerTitle className="flex items-center gap-2 flex-wrap">
                <IconHistory className="size-5 shrink-0" />
                <span className="truncate">Execution Logs</span>
                {getExecutionStatusBadge(executionStatus)}
              </DrawerTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1 shrink-0">
                  <IconClock className="size-4" />
                  Duration: {formatDuration(duration)}
                </div>
                <div className="truncate font-mono">
                  Session: {execution.sessionId.slice(0, 8)}...
                </div>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <ScrollArea className="h-full px-4 pb-6 overflow-y-auto">
          <div className="space-y-4 py-4">
            {/* Test Results Section */}
            {testResults.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-semibold">Test Results</h3>
                <div className="space-y-2">
                  {testResults.map((test) => (
                    <div
                      key={test.id}
                      className={cn(
                        "rounded-lg border p-3 transition-colors overflow-hidden",
                        test.status === "passed" &&
                          "border-green-500/50 bg-green-500/5",
                        test.status === "failed" &&
                          "border-red-500/50 bg-red-500/5",
                        test.status === "running" &&
                          "border-blue-500/50 bg-blue-500/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {test.testName}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-xs shrink-0"
                            >
                              {test.testType}
                            </Badge>
                            {test.durationMs > 0 && (
                              <span className="text-xs text-muted-foreground shrink-0 font-mono">
                                {test.durationMs}ms
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0">
                          {getTestStatusBadge(test.status)}
                        </div>
                      </div>

                      {/* Result Data */}
                      {test.resultData && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-2">
                            <IconFileText className="size-3" />
                            View result data
                          </summary>
                          <div className="mt-2 rounded bg-muted p-2 overflow-auto max-h-32">
                            <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                              {JSON.stringify(test.resultData, null, 2)}
                            </pre>
                          </div>
                        </details>
                      )}

                      {/* Container Logs */}
                      {test.containerLogs &&
                        Object.keys(test.containerLogs).length > 0 && (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground flex items-center gap-2">
                              <IconTerminal className="size-3" />
                              View container logs (
                              {Object.keys(test.containerLogs).length})
                            </summary>

                            <div className="mt-2 max-h-64 overflow-auto rounded bg-slate-950 dark:bg-slate-900 p-3 space-y-4">
                              {Object.entries(test.containerLogs).map(
                                ([containerName, logs]) => (
                                  <div
                                    key={containerName}
                                    className="space-y-2 overflow-hidden"
                                  >
                                    {/* Container Header */}
                                    <div className="flex items-center gap-2 pb-2 border-b border-slate-800 dark:border-slate-700">
                                      <IconTerminal className="size-3 text-emerald-400 shrink-0" />
                                      <div className="text-xs font-semibold text-emerald-400 truncate font-mono">
                                        {containerName}
                                      </div>
                                    </div>

                                    {/* Log Content */}
                                    <div className="font-mono text-xs bg-slate-900 dark:bg-slate-950 p-3 rounded border border-slate-800 dark:border-slate-700 overflow-auto">
                                      <pre className="whitespace-pre-wrap break-words text-slate-300 dark:text-slate-400">
                                        {logs}
                                      </pre>
                                    </div>
                                  </div>
                                ),
                              )}
                            </div>
                          </details>
                        )}
                    </div>
                  ))}
                </div>
                <Separator />
              </div>
            )}

            {/* Execution Logs */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <IconFileText className="size-4 text-muted-foreground" />
                <h3 className="font-semibold">Execution Logs</h3>
                {execution.logs.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {execution.logs.length}
                  </Badge>
                )}
              </div>
              {execution.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconClock className="mb-2 size-12 opacity-20" />
                  <div>No logs yet…</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {execution.logs.map((log, i) => {
                    const isError =
                      log.toLowerCase().includes("error") ||
                      log.toLowerCase().includes("failed");
                    const isWarning = log.toLowerCase().includes("warning");
                    const isSuccess =
                      log.toLowerCase().includes("completed") ||
                      log.toLowerCase().includes("success") ||
                      log.includes("✅") ||
                      log.includes("🎉");

                    return (
                      <div
                        key={`${execution.sessionId}-${i}-${log.slice(0, 16)}`}
                        className={cn(
                          "rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors overflow-hidden",
                          isError &&
                            "border-red-200 bg-red-50 text-red-900 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200",
                          isWarning &&
                            "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/50 dark:text-yellow-200",
                          isSuccess &&
                            "border-green-200 bg-green-50 text-green-900 dark:border-green-900/50 dark:bg-green-950/50 dark:text-green-200",
                          !isError && !isWarning && !isSuccess && "bg-muted",
                        )}
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-muted-foreground text-xs shrink-0">
                            [{i.toString().padStart(3, "0")}]
                          </span>
                          <span className="flex-1 wrap-break-words">{log}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
