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
      <DialogContent className="flex h-[80vh] min-w-[80vw] flex-col overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/30 px-6 py-3">
          <div className="flex items-center justify-between gap-4 pr-8">
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
              <div className="flex rounded-lg border bg-background/80 p-1 shadow-sm">
                <Button
                  size="sm"
                  variant={mode === "journey" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setMode("journey")}
                >
                  <IconRoute className="mr-1.5 size-3.5" />
                  Journey
                </Button>
                <Button
                  size="sm"
                  variant={mode === "configure" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setMode("configure")}
                >
                  <IconListDetails className="mr-1.5 size-3.5" />
                  Configure
                </Button>
              </div>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
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
