"use client";

import {
  IconApi,
  IconCube,
  IconPlus,
  IconServer,
  IconSettings,
  IconWorldWww,
} from "@tabler/icons-react";
import type React from "react";
import type { SVGProps } from "react";
import { useEffect, useState } from "react";
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
import { GUIDED_DOCUMENTATION } from "../lib/builder-experience";
import type { ServiceType } from "../types/react-flow-cots";
import { ContextHelp, DocumentationLink } from "./BuilderHelp";
import { DockerIcon } from "./logos/DockerIcon";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { MongoDBIcon } from "./logos/MongoDBIcon";
import { MySQLIcon } from "./logos/MysqlIcon";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { RabbitMQIcon } from "./logos/RabbitMQIcon";
import { RedisIcon } from "./logos/RedisIcon";

interface NodeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (type: ServiceType) => void;
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
    type: ServiceType;
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
      type: "memcached",
      label: "Memcached",
      icon: IconServer,
      description: "Memcached cache service",
    },
    {
      type: "kafka",
      label: "Kafka",
      icon: ApacheKafkaIcon,
      description: "Kafka queue service",
    },
    {
      type: "rabbitmq",
      label: "RabbitMQ",
      icon: RabbitMQIcon,
      description: "RabbitMQ queue service",
    },
    {
      type: "mongodb",
      label: "MongoDB",
      icon: MongoDBIcon,
      description: "MongoDB document database",
    },
    {
      type: "nginx",
      label: "Nginx",
      icon: IconWorldWww,
      description: "Nginx web server and reverse proxy",
    },
    {
      type: "mockserver",
      label: "MockServer",
      icon: IconApi,
      description: "HTTP service with configurable mock responses",
    },
    {
      type: "generic",
      label: "Application",
      icon: DockerIcon,
      description: "Your application container image",
    },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        data-testid="workflow-node-drawer"
        className="overflow-y-auto p-0 motion-reduce:animate-none motion-reduce:transition-none data-[side=right]:w-full data-[side=right]:max-w-[33.75rem] data-[side=right]:sm:w-[33.75rem] data-[side=right]:sm:max-w-[33.75rem]"
      >
        <SheetHeader className="border-b bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
              <IconCube />
            </div>
            <div>
              <SheetTitle className="text-base font-semibold">
                Workflow Setup
              </SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                Configure workflow and add services to your graph
              </SheetDescription>
              <DocumentationLink href={GUIDED_DOCUMENTATION.services.href}>
                Learn how services are configured
              </DocumentationLink>
            </div>
          </div>
        </SheetHeader>
        <div className=" px-3 py-5 space-y-8">
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <IconSettings className="size-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                Workflow Details
              </h3>
            </div>

            <div className="rounded-xl border border-border/60 bg-card shadow-sm p-4">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Workflow Name
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={workflowName}
                    onChange={(event) => setWorkflowName(event.target.value)}
                    disabled={!isEditingName}
                    className="font-medium shadow-sm"
                    placeholder="Enter the workflow name"
                  />
                  {isEditingName ? (
                    <Button
                      onClick={handleSaveWorkflowName}
                      className="shadow-sm"
                    >
                      Save
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={() => setIsEditingName(true)}
                      className="shadow-sm"
                    >
                      Edit
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                  <IconPlus className="size-4" />
                  Add Services
                </h3>
                <ContextHelp label="service catalog">
                  Choose a managed dependency such as PostgreSQL or MockServer,
                  or choose Application for a container image that belongs to
                  your system.
                </ContextHelp>
              </div>
              <span className="text-xs text-muted-foreground font-medium">
                {nodeTypes.length} available
              </span>
            </div>

            <div className="grid gap-3 grid-cols-1">
              {nodeTypes.map((nodeType) => {
                const Icon = nodeType.icon;
                return (
                  <button
                    type="button"
                    key={nodeType.type}
                    onClick={() => onAddNode(nodeType.type)}
                    className="group rounded-lg border border-border/60 bg-card p-4 text-left transition-all duration-200 hover:shadow-md hover:bg-primary/5 hover:border-primary/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded bg-muted/60 group-hover:bg-primary/10 transition-colors shrink-0">
                        <Icon className="size-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm mb-0.5">
                          {nodeType.label}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {nodeType.description}
                        </div>
                      </div>
                      <IconPlus className="size-4 text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};
