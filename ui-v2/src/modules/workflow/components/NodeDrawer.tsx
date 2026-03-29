"use client";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconCheck,
  IconGripVertical,
  IconPlus,
  IconSettings,
  IconTestPipe2,
} from "@tabler/icons-react";
import type { SVGProps } from "react";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { FlowNode } from "../types/react-flow-cots";
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
  workflowId: string;
  currentWorkflowName?: string;
  onWorkflowNameChange?: (name: string) => void;
  nodes?: FlowNode[];
  onTestOrderChange?: (globalOrder: Map<string, string[]>) => void;
  customTestOrder?: Map<string, string[]>;
}

interface TestItem {
  id: string;
  name: string;
  type: string;
  nodeId: string;
  nodeName: string;
}

interface SortableTestItemProps {
  test: TestItem;
  index: number;
}

type NodeIconComponent = React.FC<SVGProps<SVGSVGElement>>;

const SortableTestItem: React.FC<SortableTestItemProps> = ({ test, index }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: test.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div className="relative">
      <div className="absolute -left-6 top-1/2 -translate-y-1/2 text-xs font-medium text-muted-foreground">
        {index + 1}
      </div>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex items-center gap-3 rounded-md border bg-background p-3 transition-shadow",
          isDragging && "shadow-lg opacity-50",
        )}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing"
        >
          <IconGripVertical className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">{test.name}</p>
          <p className="text-xs text-muted-foreground">
            {test.nodeName} • {test.type}
          </p>
        </div>
      </div>
    </div>
  );
};

export const NodeDrawer: React.FC<NodeDrawerProps> = ({
  isOpen,
  onClose,
  onAddNode,
  workflowId,
  currentWorkflowName = "Untitled Workflow",
  onWorkflowNameChange,
  nodes = [],
  onTestOrderChange,
  customTestOrder,
}) => {
  const [workflowName, setWorkflowName] = useState(currentWorkflowName);
  const [isEditingName, setIsEditingName] = useState(false);
  const [tests, setTests] = useState<TestItem[]>([]);
  const [_isDragging, setIsDragging] = useState(false);
  const _initializedRef = React.useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    setWorkflowName(currentWorkflowName);
  }, [currentWorkflowName]);

  useEffect(() => {
    if (!isOpen) return;

    const allTests: TestItem[] = [];

    nodes.forEach((node) => {
      const nodeTests = node.data.tests ?? [];
      nodeTests.forEach((test) => {
        allTests.push({
          id: test.id,
          name: test.name,
          type: test.type,
          nodeId: node.id,
          nodeName: node.data.label,
        });
      });
    });

    if (customTestOrder && customTestOrder.size > 0) {
      const orderMap = new Map<string, number>();
      let index = 0;

      for (const [, testIds] of customTestOrder.entries()) {
        for (const id of testIds) {
          orderMap.set(id, index++);
        }
      }

      allTests.forEach((t) => {
        if (!orderMap.has(t.id)) {
          orderMap.set(t.id, index++);
        }
      });

      allTests.sort((a, b) => {
        const aOrder = orderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = orderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder;
      });
    }

    setTests(allTests);
  }, [isOpen, nodes, customTestOrder]);

  const handleSaveWorkflowName = () => {
    if (workflowName.trim() && onWorkflowNameChange) {
      onWorkflowNameChange(workflowName.trim());
      setIsEditingName(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDragging(false);

    if (!over || active.id === over.id) return;

    const oldIndex = tests.findIndex((t) => t.id === active.id);
    const newIndex = tests.findIndex((t) => t.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Update local state immediately
    const reorderedTests = arrayMove(tests, oldIndex, newIndex);
    setTests(reorderedTests);

    // Build the new global order grouped by node
    const newGlobalOrder = new Map<string, string[]>();

    reorderedTests.forEach((test) => {
      if (!newGlobalOrder.has(test.nodeId)) {
        newGlobalOrder.set(test.nodeId, []);
      }
      newGlobalOrder.get(test.nodeId)?.push(test.id);
    });

    // Pass the entire order to parent at once
    if (onTestOrderChange) {
      onTestOrderChange(newGlobalOrder);
    }
  };

  const nodeTypes: Array<{
    type: "postgres" | "mariadb" | "mysql" | "redis" | "kafka" | "generic";
    label: string;
    icon: NodeIconComponent;
    description: string;
    color: string;
  }> = [
    {
      type: "postgres",
      label: "PostgreSQL",
      icon: PostgreSQLIcon,
      description: "PostgreSQL database service",
      color: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20",
    },
    {
      type: "mariadb",
      label: "MariaDB",
      icon: MariaDBIcon,
      description: "MariaDB database service",
      color: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20",
    },
    {
      type: "mysql",
      label: "MySQL",
      icon: MySQLIcon,
      description: "MySQL database service",
      color: "bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20",
    },
    {
      type: "redis",
      label: "Redis",
      icon: RedisIcon,
      description: "Redis in-memory cache service",
      color: "bg-red-500/10 border-red-500/20 hover:bg-red-500/20",
    },
    {
      type: "kafka",
      label: "Kafka",
      icon: ApacheKafkaIcon,
      description: "Kafka message queue",
      color: "bg-red-500/40 border-red-500/30 hover:bg-red-500/50",
    },
    {
      type: "generic",
      label: "Generic Service",
      icon: DockerIcon,
      description: "Custom Docker container service",
      color: "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20",
    },
  ];

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="w-100 sm:w-135 p-2 overflow-y-auto">
        <SheetHeader className="space-y-4">
          <SheetTitle className="flex items-center gap-2">
            <IconSettings className="size-5" />
            Workflow Settings
          </SheetTitle>
          <SheetDescription>
            Configure your workflow and add nodes to the canvas
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Workflow Name Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="workflow-name" className="text-sm font-semibold">
                Workflow Name
              </Label>
              {!isEditingName && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingName(true)}
                  className="h-7 text-xs"
                >
                  Edit
                </Button>
              )}
            </div>

            {isEditingName ? (
              <div className="flex gap-2">
                <Input
                  id="workflow-name"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  placeholder="Enter workflow name"
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleSaveWorkflowName();
                    } else if (e.key === "Escape") {
                      setWorkflowName(currentWorkflowName);
                      setIsEditingName(false);
                    }
                  }}
                  autoFocus
                />
                <Button
                  className="cursor-pointer"
                  size="icon"
                  onClick={handleSaveWorkflowName}
                  disabled={!workflowName.trim()}
                >
                  <IconCheck className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/50 px-4 py-2.5">
                <p className="font-medium text-foreground">{workflowName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ID: {workflowId.slice(0, 8)}...
                </p>
              </div>
            )}
          </div>

          <Separator />

          <Tabs defaultValue="nodes" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="nodes" className="flex-1">
                <IconPlus className="mr-2 size-4" />
                Nodes
              </TabsTrigger>
              <TabsTrigger value="tests" className="flex-1">
                <IconTestPipe2 className="mr-2 size-4" />
                Tests ({tests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="nodes" className="mt-4">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Select a node type to add to your workflow canvas
                </p>

                <div className="grid gap-3">
                  {nodeTypes.map((node) => {
                    const Icon = node.icon;
                    return (
                      <button
                        key={node.type}
                        type="button"
                        onClick={() => {
                          onAddNode(node.type);
                          onClose();
                        }}
                        className={cn(
                          "group flex items-start gap-4 rounded-lg border p-4 cursor-pointer text-left transition-all",
                          node.color,
                        )}
                      >
                        <div className="rounded-md bg-background p-2 shadow-sm">
                          <Icon className="size-6 text-foreground" />
                        </div>
                        <div className="flex-1 space-y-1">
                          <p className="font-semibold leading-none group-hover:underline">
                            {node.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {node.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tests" className="mt-4">
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Drag and drop to reorder test execution. Tests will run in
                  this order across all nodes.
                </p>

                {tests.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center">
                    <IconTestPipe2 className="mx-auto size-12 text-muted-foreground/50" />
                    <p className="mt-4 text-sm font-medium text-muted-foreground">
                      No tests defined yet
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Add tests to your nodes to configure execution order
                    </p>
                  </div>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragStart={() => setIsDragging(true)}
                    onDragEnd={handleDragEnd}
                    onDragCancel={() => setIsDragging(false)}
                  >
                    <SortableContext
                      items={tests.map((test) => test.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {tests.map((test, index) => (
                          <SortableTestItem
                            key={test.id}
                            test={test}
                            index={index}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
};
