"use client";

import { useMemo, useState } from "react";
import {
  useExecutionStore,
  WorkflowExecution,
} from "../stores/execution.store.sync";
import { Badge } from "@/components/ui/badge";
import {
  IconCheck,
  IconClock,
  IconHistory,
  IconTrash,
  IconX,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

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
      (e) => e.workflowId === workflowId,
    );
  }, [executionsMap, workflowId]);

  const sortedExecutions = useMemo(() => {
    return [...executions].sort((a, b) => b.startedAt - a.startedAt);
  }, [executions]);

  const formatDuration = (start: number, end?: number) => {
    if (!end) return "Running...";
    const duration = end - start;
    const seconds = Math.floor(duration / 1000);
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
          <Badge variant="default" className="bg-primary">
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-[95vw] !w-[95vw] sm:!max-w-[95vw] md:!max-w-[95vw] lg:!max-w-[95vw] h-[90vh] p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-6 border-b">
          <DialogTitle className="flex items-center gap-2">
            <IconHistory className="size-5" />
            Execution History
          </DialogTitle>
          <DialogDescription>
            View and manage past workflow executions
          </DialogDescription>
        </DialogHeader>

        {/* Main Content */}
        <div className="flex h-[calc(90vh-5rem)] overflow-hidden">
          {/* Execution List - Collapsible */}
          <div
            className={cn(
              "relative transition-all duration-300 border-r bg-muted/30",
              isListCollapsed ? "w-0" : "w-80",
            )}
          >
            {/* Toggle Button */}
            <Button
              variant="outline"
              size="icon"
              className={cn(
                "absolute -right-3 top-1/2 -translate-y-1/2 z-10 h-12 w-6 rounded-lg",
                isListCollapsed && "right-0 translate-x-full",
              )}
              onClick={() => setIsListCollapsed(!isListCollapsed)}
            >
              {isListCollapsed ? (
                <IconChevronRight className="size-4" />
              ) : (
                <IconChevronLeft className="size-4" />
              )}
            </Button>

            {/* Execution List Content */}
            {!isListCollapsed && (
              <ScrollArea className="h-full px-4 py-4">
                {sortedExecutions.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    No executions yet
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sortedExecutions.map((execution) => (
                      <button
                        key={execution.sessionId}
                        onClick={() => setSelectedExecution(execution)}
                        className={cn(
                          "w-full rounded-lg border p-3 text-left transition-colors",
                          selectedExecution?.sessionId === execution.sessionId
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "hover:bg-muted/50 hover:border-muted-foreground/20",
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          {getStatusBadge(execution.status)}
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(
                              execution.startedAt,
                              execution.finishedAt,
                            )}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTimestamp(execution.startedAt)}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground truncate">
                          {execution.sessionId}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            )}
          </div>

          {/* Execution Details */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Details Header */}
            <div className="p-6 border-b bg-background flex-shrink-0">
              {selectedExecution ? (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-lg">Execution Details</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {formatTimestamp(selectedExecution.startedAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (selectedExecution) {
                        clearExecution(selectedExecution.sessionId);
                        setSelectedExecution(null);
                      }
                    }}
                  >
                    <IconTrash className="mr-2 size-4" />
                    Delete
                  </Button>
                </div>
              ) : (
                <h3 className="font-semibold text-lg">Select an execution</h3>
              )}
            </div>

            {/* Details Content */}
            <ScrollArea className="flex-1 overflow-y-auto">
              {selectedExecution ? (
                <div className="p-6 space-y-6 pb-12">
                  {/* Status Overview */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        Status
                      </div>
                      <div>{getStatusBadge(selectedExecution.status)}</div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-muted-foreground">
                        Duration
                      </div>
                      <div className="text-sm">
                        {formatDuration(
                          selectedExecution.startedAt,
                          selectedExecution.finishedAt,
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Session Info */}
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-muted-foreground">
                      Session ID
                    </div>
                    <code className="block w-full rounded bg-muted px-3 py-2 font-mono text-xs break-all">
                      {selectedExecution.sessionId}
                    </code>
                  </div>

                  <Separator />

                  {/* Logs */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold">Logs</h4>
                      <Badge variant="outline">
                        {selectedExecution.logs.length} entries
                      </Badge>
                    </div>
                    <div className="h-96 rounded-lg border bg-muted p-4 overflow-auto">
                      {selectedExecution.logs.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No logs available
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {selectedExecution.logs.map((log, i) => (
                            <div
                              key={i}
                              className="font-mono text-xs leading-relaxed"
                            >
                              <span className="text-muted-foreground mr-2 inline-block min-w-[3ch]">
                                [{String(i + 1).padStart(3, "0")}]
                              </span>
                              <span className="text-foreground whitespace-pre-wrap break-words">
                                {log}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Error */}
                  {selectedExecution.error && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h4 className="font-semibold text-destructive flex items-center gap-2">
                          <IconX className="size-4" />
                          Error
                        </h4>
                        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                          <p className="text-sm text-destructive font-mono whitespace-pre-wrap break-words">
                            {selectedExecution.error}
                          </p>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Result */}
                  {selectedExecution.result && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <h4 className="font-semibold flex items-center gap-2">
                          <IconCheck className="size-4" />
                          Result
                        </h4>
                        <div className="h-64 rounded-lg border bg-muted/50 p-4 overflow-auto">
                          <pre className="text-xs font-mono whitespace-pre-wrap break-words">
                            {JSON.stringify(selectedExecution.result, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-8">
                  <div className="text-center space-y-2">
                    <IconHistory className="size-12 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">
                      Select an execution from the list to view details
                    </p>
                  </div>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
