"use client";

import { useMemo, useEffect, useRef } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { WorkflowExecution } from "../stores/execution.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconAlertTriangle,
  IconLoader,
  IconHistory,
} from "@tabler/icons-react";

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
  const allTestResults = useTestResultStore((s) => s.testResults);

  // Filter test results for this execution
  const testResults = useMemo(() => {
    if (!sessionId) return [];
    return Object.values(allTestResults).filter(
      (tr) => tr.sessionId === sessionId && !tr.is_deleted,
    );
  }, [allTestResults, sessionId]);

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
          <Badge className="bg-primary text-white">
            <IconCircleCheck className="mr-1 size-3" />
            Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <IconCircleX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary">
            <IconLoader className="mr-1 size-3 animate-spin" />
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
          <Badge className="bg-green-500 text-white">
            <IconCircleCheck className="mr-1 size-3" />
            Passed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <IconCircleX className="mr-1 size-3" />
            Failed
          </Badge>
        );
      case "running":
        return (
          <Badge variant="secondary" className="bg-blue-500 text-white">
            <IconLoader className="mr-1 size-3 animate-spin" />
            Running
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [execution?.logs, testResults.length]);

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
            <div className="space-y-2">
              <DrawerTitle className="flex items-center gap-2">
                <IconHistory className="size-5" />
                Execution Logs
                {getExecutionStatusBadge(executionStatus)}
              </DrawerTitle>
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <IconClock className="size-4" />
                  Duration: {formatDuration(duration)}
                </div>
                <div>Session: {execution.sessionId.slice(0, 8)}...</div>
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
                        "rounded-lg border p-3 transition-colors",
                        test.status === "passed" &&
                          "border-green-500/50 bg-green-500/5",
                        test.status === "failed" &&
                          "border-destructive/50 bg-destructive/5",
                        test.status === "running" &&
                          "border-blue-500/50 bg-blue-500/5",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium">{test.testName}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="outline" className="text-xs">
                              {test.testType}
                            </Badge>
                            {test.durationMs > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {test.durationMs}ms
                              </span>
                            )}
                          </div>
                        </div>
                        <div>{getTestStatusBadge(test.status)}</div>
                      </div>

                      {test.resultData && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            View result data
                          </summary>
                          <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-auto max-h-32">
                            {JSON.stringify(test.resultData, null, 2)}
                          </pre>
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
              <h3 className="font-semibold">Execution Logs</h3>
              {execution.logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <IconClock className="mb-2 size-12 opacity-20" />
                  <div>No logs yet…</div>
                </div>
              ) : (
                execution.logs.map((log, i) => {
                  const isError =
                    log.toLowerCase().includes("error") ||
                    log.toLowerCase().includes("failed");
                  const isWarning = log.toLowerCase().includes("warning");
                  const isSuccess =
                    log.toLowerCase().includes("completed") ||
                    log.toLowerCase().includes("success") ||
                    log.includes("✅");

                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-lg border px-4 py-2.5 font-mono text-sm transition-colors",
                        isError &&
                          "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-100",
                        isWarning &&
                          "border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-100",
                        isSuccess &&
                          "border-green-200 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950 dark:text-green-100",
                        !isError && !isWarning && !isSuccess && "bg-muted",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground text-xs">
                          [{i.toString().padStart(3, "0")}]
                        </span>
                        <span className="flex-1">{log}</span>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
