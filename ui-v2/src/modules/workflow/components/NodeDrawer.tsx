// "use client";
// import { Button } from "@/components/ui/button";
// import {
//   Sheet,
//   SheetContent,
//   SheetDescription,
//   SheetHeader,
//   SheetTitle,
// } from "@/components/ui/sheet";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Separator } from "@/components/ui/separator";
// import {
//   IconContainer,
//   IconDatabase,
//   IconSettings,
//   IconPlus,
//   IconCheck,
//   IconGripVertical,
//   IconTestPipe2,
// } from "@tabler/icons-react";
// import React, { useState, useEffect, useMemo } from "react";
// import { cn } from "@/lib/utils";
// import { FlowNode } from "../types/react-flow-cots";
// import {
//   arrayMove,
//   SortableContext,
//   sortableKeyboardCoordinates,
//   useSortable,
//   verticalListSortingStrategy,
// } from "@dnd-kit/sortable";
// import {
//   DndContext,
//   closestCenter,
//   KeyboardSensor,
//   PointerSensor,
//   useSensor,
//   useSensors,
//   DragEndEvent,
//   DragPendingEvent,
// } from "@dnd-kit/core";
// import { CSS } from "@dnd-kit/utilities";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// interface NodeDrawerProps {
//   isOpen: boolean;
//   onClose: () => void;
//   onAddNode: (type: "postgres" | "mariadb" | "mysql" | "generic") => void;
//   workflowId: string;
//   currentWorkflowName?: string;
//   onWorkflowNameChange?: (name: string) => void;
//   nodes?: FlowNode[];
//   onTestOrderChange?: (nodeId: string, testOrder: string[]) => void;
//   customTestOrder?: Map<string, string[]>;
// }

// interface TestItem {
//   id: string;
//   name: string;
//   type: string;
//   nodeId: string;
//   nodeName: string;
// }
// interface SortableTestItemProps {
//   test: TestItem;
// }

// const SortableTestItem: React.FC<SortableTestItemProps> = ({ test }) => {
//   const {
//     attributes,
//     listeners,
//     setNodeRef,
//     transform,
//     transition,
//     isDragging,
//   } = useSortable({ id: test.id });
//   const style = {
//     transform: CSS.Transform.toString(transform),
//     transition,
//   };

//   return (
//     <div
//       ref={setNodeRef}
//       style={style}
//       className={cn(
//         "flex items-center gap-3 rounded-md border bg-background p-3 transition-shadow",
//         isDragging && "shadow-lg opacity-50",
//       )}
//     >
//       <div
//         {...attributes}
//         {...listeners}
//         className="cursor-grab active:cursor-grabbing"
//       >
//         <IconGripVertical className="size-5 text-muted-foreground" />
//       </div>
//       <div className="flex-1">
//         <p className="text-sm font-medium">{test.name}</p>
//         <p className="text-xs text-muted-foreground">
//           {test.nodeName} • {test.type}
//         </p>
//       </div>
//     </div>
//   );
// };

// export const NodeDrawer: React.FC<NodeDrawerProps> = ({
//   isOpen,
//   onClose,
//   onAddNode,
//   workflowId,
//   currentWorkflowName = "Untitled Workflow",
//   onWorkflowNameChange,
//   nodes = [],
//   onTestOrderChange,
//   customTestOrder,
// }) => {
//   const [workflowName, setWorkflowName] = useState(currentWorkflowName);
//   const [isEditingName, setIsEditingName] = useState(false);
//   const tests = useMemo<TestItem[]>(() => {
//     const all: TestItem[] = [];

//     nodes.forEach((node) => {
//       const nodeTests = node.data.tests ?? [];
//       const order = customTestOrder?.get(node.id);

//       const orderedTests = order
//         ? [...nodeTests].sort(
//             (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
//           )
//         : nodeTests;

//       orderedTests.forEach((test) => {
//         all.push({
//           id: test.id,
//           name: test.name,
//           type: test.type,
//           nodeId: node.id,
//           nodeName: node.data.label,
//         });
//       });
//     });

//     return all;
//   }, [nodes, customTestOrder]);

//   const sensors = useSensors(
//     useSensor(PointerSensor),
//     useSensor(KeyboardSensor, {
//       coordinateGetter: sortableKeyboardCoordinates,
//     }),
//   );

//   useEffect(() => {
//     setWorkflowName(currentWorkflowName);
//   }, [currentWorkflowName]);

//   const handleSaveWorkflowName = () => {
//     if (workflowName.trim() && onWorkflowNameChange) {
//       onWorkflowNameChange(workflowName.trim());
//       setIsEditingName(false);
//     }
//   };

//   const handleDragEnd = (event: DragEndEvent) => {
//     const { active, over } = event;
//     if (!over || active.id === over.id) return;

//     const oldIndex = tests.findIndex((t) => t.id === active.id);
//     const newIndex = tests.findIndex((t) => t.id === over.id);

//     if (oldIndex === -1 || newIndex === -1) return;

//     const newOrder = arrayMove(tests, oldIndex, newIndex);

//     // group by node
//     const testsByNode = new Map<string, string[]>();
//     newOrder.forEach((test) => {
//       if (!testsByNode.has(test.nodeId)) {
//         testsByNode.set(test.nodeId, []);
//       }
//       testsByNode.get(test.nodeId)!.push(test.id);
//     });

//     // notify parent ONLY
//     testsByNode.forEach((testIds, nodeId) => {
//       onTestOrderChange?.(nodeId, testIds);
//     });
//   };

//   const nodeTypes = [
//     {
//       type: "postgres" as const,
//       label: "PostgreSQL",
//       icon: IconDatabase,
//       description: "PostgreSQL database service",
//       color: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20",
//     },
//     {
//       type: "mariadb" as const,
//       label: "MariaDB",
//       icon: IconDatabase,
//       description: "MariaDB database service",
//       color: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20",
//     },
//     {
//       type: "mysql" as const,
//       label: "MySQL",
//       icon: IconDatabase,
//       description: "MySQL database service",
//       color: "bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20",
//     },
//     {
//       type: "generic" as const,
//       label: "Generic Service",
//       icon: IconContainer,
//       description: "Custom Docker container service",
//       color: "bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20",
//     },
//   ];

//   return (
//     <Sheet open={isOpen} onOpenChange={onClose}>
//       <SheetContent className="w-100 sm:w-135 p-2">
//         <SheetHeader className="space-y-4">
//           <SheetTitle className="flex items-center gap-2">
//             <IconSettings className="size-5" />
//             Workflow Settings
//           </SheetTitle>
//           <SheetDescription>
//             Configure your workflow and add nodes to the canvas
//           </SheetDescription>
//         </SheetHeader>

//         <div className="mt-6 space-y-6">
//           {/* Workflow Name Section */}
//           <div className="space-y-3">
//             <div className="flex items-center justify-between">
//               <Label htmlFor="workflow-name" className="text-sm font-semibold">
//                 Workflow Name
//               </Label>
//               {!isEditingName && (
//                 <Button
//                   variant="ghost"
//                   size="sm"
//                   onClick={() => setIsEditingName(true)}
//                   className="h-7 text-xs"
//                 >
//                   Edit
//                 </Button>
//               )}
//             </div>

//             {isEditingName ? (
//               <div className="flex gap-2">
//                 <Input
//                   id="workflow-name"
//                   value={workflowName}
//                   onChange={(e) => setWorkflowName(e.target.value)}
//                   placeholder="Enter workflow name"
//                   className="flex-1"
//                   onKeyDown={(e) => {
//                     if (e.key === "Enter") {
//                       handleSaveWorkflowName();
//                     } else if (e.key === "Escape") {
//                       setWorkflowName(currentWorkflowName);
//                       setIsEditingName(false);
//                     }
//                   }}
//                   autoFocus
//                 />
//                 <Button
//                   className="cursor-pointer"
//                   size="icon"
//                   onClick={handleSaveWorkflowName}
//                   disabled={!workflowName.trim()}
//                 >
//                   <IconCheck className="size-4" />
//                 </Button>
//               </div>
//             ) : (
//               <div className="rounded-lg border bg-muted/50 px-4 py-2.5">
//                 <p className="font-medium text-foreground">{workflowName}</p>
//                 <p className="mt-1 text-xs text-muted-foreground">
//                   ID: {workflowId.slice(0, 8)}...
//                 </p>
//               </div>
//             )}
//           </div>

//           <Separator />
//           <div className="flex w-full max-w-sm flex-col gap-6">
//             <Tabs defaultValue="nodes">
//               <TabsList>
//                 <TabsTrigger value="nodes">Nodes</TabsTrigger>
//                 <TabsTrigger value="tests">Tests</TabsTrigger>
//               </TabsList>
//               <TabsContent value="nodes">
//                 <div className="space-y-3">
//                   <p className="text-xs text-muted-foreground">
//                     Select a node type to add to your workflow canvas
//                   </p>

//                   <div className="grid gap-3">
//                     {nodeTypes.map((node) => {
//                       const Icon = node.icon;
//                       return (
//                         <button
//                           key={node.type}
//                           type="button"
//                           onClick={() => {
//                             onAddNode(node.type);
//                             onClose();
//                           }}
//                           className={cn(
//                             "group flex items-start gap-4 rounded-lg border p-4 cursor-pointer text-left transition-all",
//                             node.color,
//                           )}
//                         >
//                           <div className="rounded-md bg-background p-2 shadow-sm">
//                             <Icon className="size-6" />
//                           </div>
//                           <div className="flex-1 space-y-1">
//                             <p className="font-semibold leading-none group-hover:underline">
//                               {node.label}
//                             </p>
//                             <p className="text-xs text-muted-foreground">
//                               {node.description}
//                             </p>
//                           </div>
//                         </button>
//                       );
//                     })}
//                   </div>
//                 </div>
//               </TabsContent>
//               <TabsContent value="tests">
//                 <div className="space-y-3">
//                   <p className="text-xs text-muted-foreground">
//                     Drag and drop to reorder test execution. Tests will run in
//                     this order across all nodes.
//                   </p>

//                   {tests.length === 0 ? (
//                     <div className="rounded-lg border border-dashed p-8 text-center">
//                       <IconTestPipe2 className="mx-auto size-12 text-muted-foreground/50" />
//                       <p className="mt-4 text-sm font-medium text-muted-foreground">
//                         No tests defined yet
//                       </p>
//                       <p className="mt-1 text-xs text-muted-foreground">
//                         Add tests to your nodes to configure execution order
//                       </p>
//                     </div>
//                   ) : (
//                     <DndContext
//                       sensors={sensors}
//                       collisionDetection={closestCenter}
//                       onDragEnd={handleDragEnd}
//                     >
//                       <SortableContext
//                         items={tests.map((test) => test.id)}
//                         strategy={verticalListSortingStrategy}
//                       >
//                         <div className="space-y-2">
//                           {tests.map((test, index) => (
//                             <div key={test.id} className="relative">
//                               <div
//                                 className="absolute -left-2 top-0.5
//                                 -translate-y-0.15 text-xs
//                                 font-medium text-muted-foreground"
//                               >
//                                 {index + 1}
//                               </div>
//                               <SortableTestItem test={test} />
//                             </div>
//                           ))}
//                         </div>
//                       </SortableContext>
//                     </DndContext>
//                   )}
//                 </div>
//               </TabsContent>
//             </Tabs>
//           </div>
//           {/* Add Nodes Section */}
//           {/*<div className="space-y-3">
//             <div className="flex items-center gap-2">
//               <IconPlus className="size-4" />
//               <Label className="text-sm font-semibold">Add Nodes</Label>
//             </div>
//             <p className="text-xs text-muted-foreground">
//               Select a node type to add to your workflow canvas
//             </p>

//             <div className="grid gap-3">
//               {nodeTypes.map((node) => {
//                 const Icon = node.icon;
//                 return (
//                   <button
//                     key={node.type}
//                     type="button"
//                     onClick={() => {
//                       onAddNode(node.type);
//                       onClose();
//                     }}
//                     className={cn(
//                       "group flex items-start gap-4 rounded-lg border p-4 cursor-pointer text-left transition-all",
//                       node.color,
//                     )}
//                   >
//                     <div className="rounded-md bg-background p-2 shadow-sm">
//                       <Icon className="size-6" />
//                     </div>
//                     <div className="flex-1 space-y-1">
//                       <p className="font-semibold leading-none group-hover:underline">
//                         {node.label}
//                       </p>
//                       <p className="text-xs text-muted-foreground">
//                         {node.description}
//                       </p>
//                     </div>
//                   </button>
//                 );
//               })}
//             </div>
//           </div>*/}
//         </div>
//       </SheetContent>
//     </Sheet>
//   );
// };
"use client";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  IconContainer,
  IconDatabase,
  IconSettings,
  IconPlus,
  IconCheck,
  IconGripVertical,
  IconTestPipe2,
} from "@tabler/icons-react";
import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { FlowNode } from "../types/react-flow-cots";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface NodeDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onAddNode: (type: "postgres" | "mariadb" | "mysql" | "generic") => void;
  workflowId: string;
  currentWorkflowName?: string;
  onWorkflowNameChange?: (name: string) => void;
  nodes?: FlowNode[];
  onTestOrderChange?: (globalOrder: Map<string, string[]>) => void; // CHANGED: Pass entire order at once
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
  const [isDragging, setIsDragging] = useState(false);
  const initializedRef = React.useRef(false);

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
        testIds.forEach((id) => orderMap.set(id, index++));
      }

      allTests.forEach((t) => {
        if (!orderMap.has(t.id)) {
          orderMap.set(t.id, index++);
        }
      });

      allTests.sort((a, b) => orderMap.get(a.id)! - orderMap.get(b.id)!);
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
      newGlobalOrder.get(test.nodeId)!.push(test.id);
    });

    // Pass the entire order to parent at once
    if (onTestOrderChange) {
      onTestOrderChange(newGlobalOrder);
    }
  };

  const nodeTypes = [
    {
      type: "postgres" as const,
      label: "PostgreSQL",
      icon: IconDatabase,
      description: "PostgreSQL database service",
      color: "bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20",
    },
    {
      type: "mariadb" as const,
      label: "MariaDB",
      icon: IconDatabase,
      description: "MariaDB database service",
      color: "bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20",
    },
    {
      type: "mysql" as const,
      label: "MySQL",
      icon: IconDatabase,
      description: "MySQL database service",
      color: "bg-cyan-500/10 border-cyan-500/20 hover:bg-cyan-500/20",
    },
    {
      type: "generic" as const,
      label: "Generic Service",
      icon: IconContainer,
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
                          <Icon className="size-6" />
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
