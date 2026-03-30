"use client";

import { IconPlus, IconSettings } from "@tabler/icons-react";
import type { SVGProps } from "react";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DockerIcon } from "./logos/DockerIcon";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { MySQLIcon } from "./logos/MysqlIcon";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { RedisIcon } from "./logos/RedisIcon";

interface NodeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (
    type: "postgres" | "mariadb" | "mysql" | "generic" | "redis" | "kafka",
  ) => void;
  currentWorkflowName?: string;
  onWorkflowNameChange?: (name: string) => void;
}

type NodeIconComponent = React.FC<SVGProps<SVGSVGElement>>;

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  isOpen,
  onClose,
  onAddNode,
  currentWorkflowName = "Untitled Workflow",
  onWorkflowNameChange,
}) => {
  const [workflowName, setWorkflowName] = useState(currentWorkflowName);
  const [isEditingName, setIsEditingName] = useState(false);

  useEffect(() => {
    setWorkflowName(currentWorkflowName);
  }, [currentWorkflowName]);

  const handleSaveWorkflowName = () => {
    if (workflowName.trim() && onWorkflowNameChange) {
      onWorkflowNameChange(workflowName.trim());
      setIsEditingName(false);
    }
  };

  const nodeTypes: Array<{
    type: "postgres" | "mariadb" | "mysql" | "redis" | "kafka" | "generic";
    label: string;
    icon: NodeIconComponent;
    description: string;
  }> = [
    {
      type: "postgres",
      label: "PostgreSQL",
      icon: PostgreSQLIcon,
      description: "PostgreSQL database service",
    },
    {
      type: "mariadb",
      label: "MariaDB",
      icon: MariaDBIcon,
      description: "MariaDB database service",
    },
    {
      type: "mysql",
      label: "MySQL",
      icon: MySQLIcon,
      description: "MySQL database service",
    },
    {
      type: "redis",
      label: "Redis",
      icon: RedisIcon,
      description: "Redis cache service",
    },
    {
      type: "kafka",
      label: "Kafka",
      icon: ApacheKafkaIcon,
      description: "Kafka queue service",
    },
    {
      type: "generic",
      label: "Generic",
      icon: DockerIcon,
      description: "Any Docker image-backed service",
    },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-[92vw] max-w-6xl overflow-y-auto p-2">
        <SheetHeader>
          <SheetTitle>Workflow Setup</SheetTitle>
          <SheetDescription>
            Manage the workflow name and expand the service graph for this
            system.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="rounded-lg border p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium">
              <IconSettings className="size-4" />
              Workflow Details
            </div>
            <Label>Workflow Name</Label>
            <div className="mt-2 flex gap-2">
              <Input
                value={workflowName}
                onChange={(event) => setWorkflowName(event.target.value)}
                disabled={!isEditingName}
              />
              {isEditingName ? (
                <Button onClick={handleSaveWorkflowName}>Save</Button>
              ) : (
                <Button variant="outline" onClick={() => setIsEditingName(true)}>
                  Edit
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="text-sm font-medium">Add Services</div>
            <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-3">
              {nodeTypes.map((nodeType) => {
                const Icon = nodeType.icon;
                return (
                  <button
                    type="button"
                    key={nodeType.type}
                    onClick={() => onAddNode(nodeType.type)}
                    className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/70"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Icon className="size-8" />
                    </div>
                    <div className="font-medium">{nodeType.label}</div>
                   
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
