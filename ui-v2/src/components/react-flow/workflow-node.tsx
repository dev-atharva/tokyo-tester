"use client";

import { IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { NodeToolbar, Position } from "reactflow";
import { Button } from "@/components/ui/button";

interface WorkflowNodeProps {
  children: ReactNode;
  showToolBar?: boolean;
  onDelete?: () => void;
  onSettings?: () => void;
  name?: string;
  description?: string;
}
export function WorkflowNode({
  children,
  showToolBar = true,
  onDelete,
  name,
  description,
}: WorkflowNodeProps) {
  return (
    <>
      {showToolBar && (
        <NodeToolbar isVisible className="flex gap-1">
          <Button size="sm" variant="destructive" onClick={onDelete} className="shadow-lg h-7 w-7 p-0">
            <IconTrash className="size-3.5" />
          </Button>
        </NodeToolbar>
      )}
      {children}
      {name && (
        <NodeToolbar
          position={Position.Bottom}
          isVisible
          className="max-w-60 text-center"
        >
          <div className="px-2.5 py-1.5 rounded-md bg-card/95 border border-border/30 shadow-md backdrop-blur-sm">
          <p className="font-medium text-xs mb-0.5">{name}</p>
          {description && (
            <p className="text-muted-foreground truncate text-[10px]">
              {description}
            </p>
          )}
          </div>
        </NodeToolbar>
      )}
    </>
  );
}
