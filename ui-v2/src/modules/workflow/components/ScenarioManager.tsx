"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconListDetails,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useScenarioStore } from "../stores/scenario.store.sync";
import type {
  FlowNode,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import { TestConfigForm } from "./TestConfigForm";

interface ScenarioManagerProps {
  workflowId: string;
  nodes: FlowNode[];
}

// ── Sortable test row ────────────────────────────────────────────────────────

interface SortableTestRowProps {
  test: ScenarioTestDefinition;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (updated: ScenarioTestDefinition) => void;
  availableServices: string[];
}

function SortableTestRow({
  test,
  index,
  isOpen,
  onToggle,
  onDelete,
  onUpdate,
  availableServices,
}: SortableTestRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: test.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Collapsible open={isOpen} onOpenChange={onToggle}>
        <div
          className={`rounded-xl border transition-colors duration-150 ${
            isOpen
              ? "border-primary/25 bg-primary/5"
              : "border-border/60 bg-background"
          }`}
        >
          {/* Header row */}
          <div className="flex w-full items-center gap-2 px-3 py-2.5">
            {/* Drag handle — separate from the collapsible trigger */}
            <button
              type="button"
              className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground/70 active:cursor-grabbing"
              {...attributes}
              {...listeners}
              tabIndex={0}
              aria-label="Drag to reorder"
            >
              <IconGripVertical className="size-3.5 shrink-0" />
            </button>

            {/* Index badge */}
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
              {index + 1}
            </span>

            {/* Name — clicking expands/collapses */}
            <CollapsibleTrigger
              className="min-w-0 flex-1 text-left text-sm font-medium text-foreground truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {test.name || `Test ${index + 1}`}
            </CollapsibleTrigger>

            {/* Type badge */}
            <span className="hidden shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
              {test.type}
            </span>

            {/* Actions */}
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <IconTrash className="size-3.5" />
              </button>
              <CollapsibleTrigger className="rounded-md p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                {isOpen ? (
                  <IconChevronDown className="size-3.5" />
                ) : (
                  <IconChevronRight className="size-3.5" />
                )}
              </CollapsibleTrigger>
            </div>
          </div>

          {/* Expanded config */}
          <CollapsibleContent>
            <div className="border-t border-border/40 px-4 pb-4 pt-3">
              <TestConfigForm
                tests={[test]}
                availableServices={availableServices}
                onChange={(updated) => {
                  if (updated[0]) onUpdate(updated[0]);
                }}
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </div>
  );
}

// ── Drag overlay (ghost while dragging) ─────────────────────────────────────

function DragOverlayRow({
  test,
  index,
}: {
  test: ScenarioTestDefinition;
  index: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-popover shadow-xl ring-2 ring-ring/15">
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <IconGripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {test.name || `Test ${index + 1}`}
        </span>
        <span className="hidden shrink-0 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
          {test.type}
        </span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ScenarioManager({ workflowId, nodes }: ScenarioManagerProps) {
  const createScenario = useScenarioStore((state) => state.createScenario);
  const updateScenario = useScenarioStore((state) => state.updateScenario);
  const deleteScenario = useScenarioStore((state) => state.deleteScenario);
  const setActiveScenario = useScenarioStore(
    (state) => state.setActiveScenario,
  );
  const scenariosMap = useScenarioStore((state) => state.scenarios);
  const activeScenarioId = useScenarioStore(
    (state) => state.activeScenarioIdByWorkflow[workflowId] ?? null,
  );

  const scenarios = useMemo(
    () =>
      Object.values(scenariosMap)
        .filter((s) => s.workflowId === workflowId && !s.is_deleted)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [scenariosMap, workflowId],
  );

  const activeScenario = useMemo(
    () =>
      (activeScenarioId ? scenariosMap[activeScenarioId] : null) ??
      scenarios[0] ??
      null,
    [activeScenarioId, scenariosMap, scenarios],
  );

  useEffect(() => {
    if (!activeScenario && scenarios.length > 0) {
      setActiveScenario(workflowId, scenarios[0].id);
    }
  }, [activeScenario, scenarios, setActiveScenario, workflowId]);

  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [activeTestId, setActiveTestId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedTests(new Set());
  }, [activeScenario?.id]);

  const toggleTest = (testId: string) => {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      next.has(testId) ? next.delete(testId) : next.add(testId);
      return next;
    });
  };

  const availableServices = nodes.map((node) =>
    node.data.label
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, ""),
  );

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTestId(active.id as string);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTestId(null);
    if (!over || active.id === over.id || !activeScenario) return;
    const oldIndex = activeScenario.tests.findIndex((t) => t.id === active.id);
    const newIndex = activeScenario.tests.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeScenario.tests, oldIndex, newIndex);
    updateScenario(activeScenario.id, {
      tests: reordered,
      testOrder: reordered.map((t) => t.id),
    });
  };

  const draggingTest = activeTestId
    ? (activeScenario?.tests.find((t) => t.id === activeTestId) ?? null)
    : null;
  const draggingIndex = draggingTest
    ? (activeScenario?.tests.indexOf(draggingTest) ?? 0)
    : 0;

  return (
    <div className="grid h-full min-h-0 gap-5 overflow-hidden md:grid-cols-[280px_minmax(0,1fr)]">
      {/* ── Scenario list ── */}
      <div className="flex min-h-0 flex-col gap-3 overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
            <IconListDetails className="size-3.5" />
            Scenarios
          </h3>
          <span className="text-xs text-muted-foreground">
            {scenarios.length}
          </span>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-border/60 bg-muted/20 p-3 shadow-sm">
          <Button
            size="sm"
            className="w-full shadow-sm"
            onClick={() => {
              const id = createScenario(
                workflowId,
                `Scenario ${scenarios.length + 1}`,
              );
              setActiveScenario(workflowId, id);
            }}
          >
            <IconPlus className="mr-1.5 size-3.5" />
            New Scenario
          </Button>

          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-1.5 pr-2">
              {scenarios.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs italic text-muted-foreground">
                    Create your first scenario
                  </p>
                </div>
              ) : (
                scenarios.map((scenario) => {
                  const isActive = activeScenario?.id === scenario.id;
                  return (
                    <button
                      type="button"
                      key={scenario.id}
                      onClick={() => setActiveScenario(workflowId, scenario.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-150 ${
                        isActive
                          ? "border-primary/25 bg-primary/8 shadow-sm"
                          : "border-border/50 bg-background hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm font-medium ${isActive ? "text-foreground" : "text-foreground"}`}
                        >
                          {scenario.name}
                        </span>
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {scenario.tests.length}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Scenario detail ── */}
      <div className="flex min-h-0 flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Scenario Details
        </h3>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60 bg-card shadow-sm">
          {!activeScenario ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <div className="rounded-full bg-muted/50 p-3">
                <IconListDetails className="size-6 text-muted-foreground" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium text-foreground/80">
                  No scenario selected
                </p>
                <p className="text-xs text-muted-foreground">
                  Create or select a scenario to configure tests
                </p>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-5 p-5">
                {/* Name + description + delete */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Scenario Name
                      </Label>
                      <Input
                        value={activeScenario.name}
                        onChange={(e) =>
                          updateScenario(activeScenario.id, {
                            name: e.target.value,
                          })
                        }
                        className="shadow-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Description
                      </Label>
                      <Textarea
                        value={activeScenario.description || ""}
                        onChange={(e) =>
                          updateScenario(activeScenario.id, {
                            description: e.target.value,
                          })
                        }
                        placeholder="What does this scenario verify?"
                        className="resize-none shadow-sm"
                        rows={2}
                      />
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteScenario(activeScenario.id)}
                    className="mt-5 shrink-0 shadow-sm"
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>

                <Separator className="bg-border/60" />

                {/* Tests section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Tests
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {activeScenario.tests.length}
                      </span>
                    </h4>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs shadow-sm"
                      onClick={() => {
                        const newTest: ScenarioTestDefinition = {
                          id: crypto.randomUUID(),
                          name: `Test ${activeScenario.tests.length + 1}`,
                          type: "http",
                          targetServices: [],
                        };
                        const updated = [...activeScenario.tests, newTest];
                        updateScenario(activeScenario.id, {
                          tests: updated,
                          testOrder: updated.map((t) => t.id),
                        });
                        setExpandedTests((prev) =>
                          new Set(prev).add(newTest.id),
                        );
                      }}
                    >
                      <IconPlus className="mr-1 size-3" />
                      Add test
                    </Button>
                  </div>

                  {activeScenario.tests.length === 0 ? (
                    <div className="flex items-center justify-center rounded-lg border border-dashed border-border/60 py-8">
                      <p className="text-xs italic text-muted-foreground">
                        No tests yet — add one above
                      </p>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext
                        items={activeScenario.tests.map((t) => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col gap-2">
                          {activeScenario.tests.map((test, index) => (
                            <SortableTestRow
                              key={test.id}
                              test={test}
                              index={index}
                              isOpen={expandedTests.has(test.id)}
                              onToggle={() => toggleTest(test.id)}
                              onDelete={() => {
                                const updated = activeScenario.tests.filter(
                                  (t) => t.id !== test.id,
                                );
                                updateScenario(activeScenario.id, {
                                  tests: updated,
                                  testOrder: updated.map((t) => t.id),
                                });
                              }}
                              onUpdate={(updated) => {
                                const updatedTests = activeScenario.tests.map(
                                  (t) => (t.id === test.id ? updated : t),
                                );
                                updateScenario(activeScenario.id, {
                                  tests: updatedTests,
                                  testOrder: updatedTests.map((t) => t.id),
                                });
                              }}
                              availableServices={availableServices}
                            />
                          ))}
                        </div>
                      </SortableContext>

                      <DragOverlay
                        dropAnimation={{ duration: 150, easing: "ease" }}
                      >
                        {draggingTest ? (
                          <DragOverlayRow
                            test={draggingTest}
                            index={draggingIndex}
                          />
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
