"use client";
import { Position } from "@xyflow/react";
import Image from "next/image";
import { type ComponentType, memo, type ReactNode, type SVGProps } from "react";
import type { NodeProps } from "reactflow";
import { BaseNode, BaseNodeContent } from "@/components/react-flow/base-node";
import { BaseHandle } from "./base-handle";
import { WorkflowNode } from "./workflow-node";

interface BaseExecutionNodeProps extends NodeProps {
  icon: string | ComponentType<SVGProps<SVGSVGElement>>;
  name: string;
  description?: string;
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
    children,
    data,
    onSettings,
  }: BaseExecutionNodeProps) => {
    const handleDelete = () => {
      data?.onDelete?.(id);
    };

    return (
      <WorkflowNode
        name={name}
        description={description}
        onDelete={handleDelete}
        onSettings={onSettings}
      >
        <BaseNode>
          <BaseNodeContent>
            {typeof Icon === "string" ? (
              <Image src={Icon} alt={name} width={16} height={16} />
            ) : (
              <Icon className="size-4 text-muted-foreground" />
            )}
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
