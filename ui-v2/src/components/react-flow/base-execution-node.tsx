"use client";
import type { NodeProps } from "@xyflow/react";
import { Position } from "@xyflow/react";
import Image from "next/image";
import { type ComponentType, memo, type ReactNode, type SVGProps } from "react";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import type { FlowNode } from "@/modules/workflow/types/react-flow-cots";
import { BaseHandle } from "./base-handle";
import { WorkflowNode } from "./workflow-node";

interface BaseExecutionNodeProps extends NodeProps<FlowNode> {
  icon: string | ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  description?: string;
  role?: string;
  technology?: string;
  children?: ReactNode;
  onSettings?: () => void;
  onDoubleClick?: () => void;
}

export const BaseExecutionNode = memo(
  ({
    id,
    icon: Icon,
    name,
    description,
    role,
    technology,
    children,
    data,
    onSettings,
  }: BaseExecutionNodeProps) => {
    const handleDelete = () => {
      data?.onDelete?.(id);
    };

    return (
      <WorkflowNode onDelete={handleDelete} onSettings={onSettings}>
        <BaseNode className="w-46 rounded-xl border bg-card/95 shadow-md backdrop-blur-sm">
          <BaseNodeContent className="min-h-22 flex-row items-center gap-3 p-3">
            <div className="shrink-0 rounded-lg border bg-muted/40 p-2.5">
              {typeof Icon === "string" ? (
                <Image src={Icon} alt={name} width={20} height={20} />
              ) : (
                <Icon className="size-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              {role ? (
                <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {role}
                </p>
              ) : null}
              <p className="truncate text-sm font-semibold leading-tight">
                {name}
              </p>
              <p className="mt-1 truncate text-[10px] text-muted-foreground">
                {description || technology}
              </p>
            </div>
            {children}
            <BaseHandle id="target-1" type="target" position={Position.Left} />
            <BaseHandle id="source-1" type="source" position={Position.Right} />
          </BaseNodeContent>
        </BaseNode>
      </WorkflowNode>
    );
  },
);

BaseExecutionNode.displayName = "BaseExecutionNode";
