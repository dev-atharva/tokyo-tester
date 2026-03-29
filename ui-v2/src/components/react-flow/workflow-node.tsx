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
        <NodeToolbar isVisible>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            <IconTrash className="size-4" />
          </Button>
        </NodeToolbar>
      )}
      {children}
      {name && (
        <NodeToolbar
          position={Position.Bottom}
          isVisible
          className="max-w-50 text-center"
        >
          <p className="font-medium">{name}</p>
          {description && (
            <p className="text-muted-foreground truncate text-sm">
              {description}
            </p>
          )}
        </NodeToolbar>
      )}
    </>
  );
}
