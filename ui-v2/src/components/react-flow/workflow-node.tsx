"use client";

import { IconTrash } from "@tabler/icons-react";
import { NodeToolbar } from "@xyflow/react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface WorkflowNodeProps {
  children: ReactNode;
  showToolBar?: boolean;
  onDelete?: () => void;
  onSettings?: () => void;
}
export function WorkflowNode({
  children,
  showToolBar = true,
  onDelete,
}: WorkflowNodeProps) {
  return (
    <>
      {showToolBar && (
        <NodeToolbar className="flex gap-1">
          <Button
            aria-label="Delete service"
            size="sm"
            variant="destructive"
            onClick={onDelete}
            className="h-7 w-7 p-0 shadow-lg"
          >
            <IconTrash className="size-3.5" />
          </Button>
        </NodeToolbar>
      )}
      {children}
    </>
  );
}
