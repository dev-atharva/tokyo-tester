"use client";

import { IconSitemap } from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { FlowNode } from "../types/react-flow-cots";
import { ScenarioManager } from "./ScenarioManager";

interface ScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  nodes: FlowNode[];
}

export function ScenarioDialog({
  open,
  onOpenChange,
  workflowId,
  nodes,
}: ScenarioDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] min-w-[80vw] flex-col p-0">
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="flex items-center gap-2">
            <IconSitemap className="size-5" />
            Scenario Configuration
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Define reusable scenario suites separately from the service graph.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1  px-5 py-4">
          <ScenarioManager workflowId={workflowId} nodes={nodes} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
