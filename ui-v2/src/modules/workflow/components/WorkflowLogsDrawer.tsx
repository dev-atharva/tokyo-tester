"use client";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { WorkflowExecution } from "../hooks/workflow.store";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import {
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconPlayerPlay,
  IconAlertTriangle,
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [execution?.logs]);

  if (!execution) {
    return null;
  }

  const duration = execution.finishedAt
    ? execution.finishedAt - execution.startedAt
    : Date.now() - execution.startedAt;

  const formatDuration = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const statusConfig = {
    running: {
      color: "bg-primary",
      icon: IconPlayerPlay,
      text: "Running",
    },
    completed: {
      color: "bg-secondary",
      icon: IconCircleCheck,
      text: "Completed",
    },
    failed: {
      color: "bg-destructive",
      icon: IconCircleX,
      text: "Failed",
    },
    idle: {
      color: "bg-muted",
      icon: IconClock,
      text: "Idle",
    },
  };

  const config = statusConfig[execution.status];
  const StatusIcon = config.icon;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-[70vh]">
        <DrawerHeader className="border-b pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <DrawerTitle className="flex items-center gap-2">
                <StatusIcon className="size-5" />
                Execution Logs
                <Badge className={cn(config.color, "text-primary-foreground")}>
                  {config.text}
                </Badge>
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
          <div className="space-y-3 py-4">
            {execution.logs.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <IconClock className="mb-2 size-12 opacity-20" />
                <div>No logs yet…</div>
              </div>
            )}

            {execution.logs.map((log, i) => {
              const isError =
                log.toLowerCase().includes("error") ||
                log.toLowerCase().includes("failed");
              const isWarning = log.toLowerCase().includes("warning");
              const isSuccess =
                log.toLowerCase().includes("completed") ||
                log.toLowerCase().includes("success");

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
                    <span className="text-muted-foreground">
                      [
                      {new Date(
                        execution.startedAt + i * 100,
                      ).toLocaleTimeString()}
                      ]
                    </span>
                    <span className="flex-1">{log}</span>
                  </div>
                </div>
              );
            })}

            {/* Error Display */}
            {execution.error && (
              <div className="mt-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                <div className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                  <IconAlertTriangle className="size-5" />
                  Error Details
                </div>
                <pre className="overflow-x-auto font-mono text-sm text-destructive">
                  {execution.error}
                </pre>
              </div>
            )}

            {/* Results Display */}
            {execution.result && execution.status === "completed" && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                <div className="mb-3 flex items-center gap-2 font-semibold text-green-900 dark:text-green-100">
                  <IconCircleCheck className="size-5" />
                  Test Results Summary
                </div>

                {execution.result.summary && (
                  <div className="mb-4 grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-white p-3 dark:bg-gray-900">
                      <div className="text-2xl font-bold text-green-600">
                        {execution.result.summary.passed}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Passed
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-gray-900">
                      <div className="text-2xl font-bold text-red-600">
                        {execution.result.summary.failed}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Failed
                      </div>
                    </div>
                    <div className="rounded-lg bg-white p-3 dark:bg-gray-900">
                      <div className="text-2xl font-bold text-gray-600">
                        {execution.result.summary.total}
                      </div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                  </div>
                )}

                {execution.result.results &&
                  execution.result.results.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-green-900 dark:text-green-100">
                        Detailed Results:
                      </div>
                      {execution.result.results.map(
                        (test: any, idx: number) => (
                          <div
                            key={idx}
                            className={cn(
                              "rounded border p-2 text-xs font-mono",
                              test.passed
                                ? "border-green-300 bg-green-100 dark:border-green-800 dark:bg-green-900"
                                : "border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-900",
                            )}
                          >
                            <div className="flex items-center gap-2">
                              {test.passed ? (
                                <IconCircleCheck className="size-4 text-green-600" />
                              ) : (
                                <IconCircleX className="size-4 text-red-600" />
                              )}
                              <span className="font-semibold">{test.name}</span>
                            </div>
                            {test.error && (
                              <div className="mt-1 text-red-700 dark:text-red-300">
                                {test.error}
                              </div>
                            )}
                          </div>
                        ),
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* Auto-scroll anchor */}
            <div ref={logsEndRef} />
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
