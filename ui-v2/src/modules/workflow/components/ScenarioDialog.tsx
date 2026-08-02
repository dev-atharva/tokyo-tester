"use client";

import { IconListDetails, IconRoute, IconSitemap } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowNode } from "../types/react-flow-cots";
import { ScenarioJourney } from "./ScenarioJourney";
import { ScenarioManager } from "./ScenarioManager";

interface ScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  nodes: FlowNode[];
  onFocusServices: (serviceNames: string[]) => void;
  canEdit: boolean;
}

export function ScenarioDialog({
  open,
  onOpenChange,
  workflowId,
  nodes,
  onFocusServices,
  canEdit,
}: ScenarioDialogProps) {
  const [mode, setMode] = useState<"journey" | "configure">("journey");
  useEffect(() => {
    if (open) setMode("journey");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="scenario-dialog"
        className="flex h-[min(82dvh,54rem)] w-[calc(100vw-2rem)] max-w-7xl flex-col overflow-hidden p-0 sm:max-w-7xl"
      >
        <DialogHeader className="border-b bg-muted/30 px-4 py-3 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-3 pr-8 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                <IconSitemap className="size-4" />
              </div>
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <IconSitemap className="size-5" />
                  Scenarios
                </DialogTitle>
                <DialogDescription className="text-xs sm:text-sm">
                  Understand the journey first, then open the technical
                  configuration when needed.
                </DialogDescription>
              </div>
            </div>
            {canEdit ? (
              <div className="flex w-full rounded-lg border bg-background/80 p-1 shadow-sm sm:w-auto">
                <Button
                  size="sm"
                  variant={mode === "journey" ? "secondary" : "ghost"}
                  className="h-7 flex-1 px-2.5 text-xs sm:flex-none"
                  onClick={() => setMode("journey")}
                >
                  <IconRoute className="mr-1.5 size-3.5" />
                  Journey
                </Button>
                <Button
                  size="sm"
                  variant={mode === "configure" ? "secondary" : "ghost"}
                  className="h-7 flex-1 px-2.5 text-xs sm:flex-none"
                  onClick={() => setMode("configure")}
                >
                  <IconListDetails className="mr-1.5 size-3.5" />
                  Configure
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden px-3 py-4 sm:px-6 sm:py-5">
          {mode === "journey" ? (
            <ScenarioJourney
              workflowId={workflowId}
              onConfigure={canEdit ? () => setMode("configure") : undefined}
              onFocusServices={(serviceNames) => {
                onFocusServices(serviceNames);
                onOpenChange(false);
              }}
            />
          ) : (
            <ScenarioManager workflowId={workflowId} nodes={nodes} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
