"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
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
  IconBrowser,
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconListDetails,
  IconPlus,
  IconSparkles,
  IconTestPipe,
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { browserTargetOptions } from "../lib/scenario-journey";
import {
  createScenarioRecipe,
  recipeAvailability,
  SCENARIO_RECIPES,
} from "../lib/scenario-recipes";
import { createDefaultTest } from "../lib/workflow-defaults";
import { useScenarioStore } from "../stores/scenario.store.sync";
import type {
  FlowNode,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import { BrowserJourneyEditor } from "./BrowserJourneyEditor";
import { ContextHelp } from "./BuilderHelp";
import { TestConfigForm } from "./TestConfigForm";

interface ScenarioManagerProps {
  workflowId: string;
  nodes: FlowNode[];
  authoringMode?: "guided" | "expert";
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
  serviceNodes: FlowNode[];
  authoringMode: "guided" | "expert";
}

function SortableTestRow({
  test,
  index,
  isOpen,
  onToggle,
  onDelete,
  onUpdate,
  availableServices,
  serviceNodes,
  authoringMode,
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
          className={`border transition-colors duration-150 ${
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
              className="cursor-grab touch-none p-0.5 text-muted-foreground/40 hover:text-muted-foreground/70 active:cursor-grabbing"
              {...attributes}
              {...listeners}
              tabIndex={0}
              aria-label="Drag to reorder"
            >
              <IconGripVertical className="size-3.5 shrink-0" />
            </button>

            {/* Index badge */}
            <span className="flex h-5 w-5 shrink-0 items-center justify-center border bg-muted/30 text-[10px] font-bold text-muted-foreground">
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
            <span className="hidden shrink-0 border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
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
                className="p-1 text-muted-foreground/40 transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <IconTrash className="size-3.5" />
              </button>
              <CollapsibleTrigger className="p-1 text-muted-foreground/40 transition-colors hover:text-muted-foreground">
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
                serviceNodes={serviceNodes}
                authoringMode={authoringMode}
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
    <div className="border border-border bg-popover shadow-lg">
      <div className="flex w-full items-center gap-2 px-3 py-2.5">
        <IconGripVertical className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center border bg-muted/30 text-[10px] font-bold text-muted-foreground">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {test.name || `Test ${index + 1}`}
        </span>
        <span className="hidden shrink-0 border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground sm:inline-block">
          {test.type}
        </span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function ScenarioManager({
  workflowId,
  nodes,
  authoringMode = "expert",
}: ScenarioManagerProps) {
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

  // The expanded rows belong to one scenario and must reset when that scenario changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the scenario identity is the reset signal.
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
    <div
      data-testid="guided-scenario-manager"
      className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1"
    >
      {/* ── Scenario list ── */}
      <div className="flex max-h-48 min-h-0 flex-col gap-3 overflow-hidden md:max-h-none">
        <div className="flex items-center justify-between border-b pb-2">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
            <IconListDetails className="size-3.5" />
            Scenarios
          </h3>
          <span className="text-xs text-muted-foreground">
            {scenarios.length}
          </span>
        </div>

        <div
          data-testid="guided-scenario-list"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden border bg-muted/10 p-3"
        >
          <Button
            size="sm"
            className="w-full"
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
                      className={`w-full border px-3 py-2.5 text-left transition-colors duration-150 ${
                        isActive
                          ? "border-primary/45 bg-primary/8"
                          : "border-border/50 bg-background hover:border-border hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {scenario.name}
                        </span>
                        <span className="shrink-0 border bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          {scenario.executionModel === "journey"
                            ? scenario.steps.length
                            : scenario.tests.length}
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
        <h3 className="border-b pb-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
          Scenario Details
        </h3>

        <div
          data-testid="guided-scenario-details"
          className="flex min-h-0 flex-1 flex-col overflow-hidden border bg-card"
        >
          {!activeScenario ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8">
              <div className="border bg-muted/30 p-3">
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
              <div className="space-y-6 p-4 lg:p-5">
                {/* Name + description + delete */}
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`scenario-name-${activeScenario.id}`}
                        className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                      >
                        Scenario Name
                      </Label>
                      <Input
                        id={`scenario-name-${activeScenario.id}`}
                        value={activeScenario.name}
                        onChange={(e) =>
                          updateScenario(activeScenario.id, {
                            name: e.target.value,
                          })
                        }
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
                        className="resize-none"
                        rows={2}
                      />
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteScenario(activeScenario.id)}
                    className="mt-5 shrink-0"
                  >
                    <IconTrash className="size-3.5" />
                  </Button>
                </div>

                <Separator className="bg-border/60" />

                <div className="grid gap-2">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground/70">
                      Execution model
                    </h4>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Choose ordered infrastructure tests or one shared browser
                      journey for this scenario.
                    </p>
                  </div>
                  <ToggleGroup
                    variant="outline"
                    size="sm"
                    value={[activeScenario.executionModel]}
                    onValueChange={(values) => {
                      const value = values.at(-1);
                      if (value === "legacy-tests") {
                        updateScenario(activeScenario.id, {
                          executionModel: value,
                        });
                      } else if (value === "journey") {
                        const firstTarget = browserTargetOptions(nodes)[0];
                        updateScenario(activeScenario.id, {
                          executionModel: value,
                          environment: activeScenario.environment ?? {
                            driver: "browser",
                            browser: {
                              targetService: firstTarget?.service ?? "",
                              targetPort: firstTarget?.ports[0] ?? "",
                            },
                          },
                        });
                      }
                    }}
                  >
                    <ToggleGroupItem value="legacy-tests">
                      <IconTestPipe data-icon="inline-start" /> Infrastructure
                      tests
                    </ToggleGroupItem>
                    <ToggleGroupItem value="journey">
                      <IconBrowser data-icon="inline-start" /> Browser journey
                    </ToggleGroupItem>
                  </ToggleGroup>
                </div>

                <Separator className="bg-border/60" />

                {activeScenario.executionModel === "journey" ? (
                  <BrowserJourneyEditor
                    scenario={activeScenario}
                    nodes={nodes}
                    onUpdate={(updates) =>
                      updateScenario(activeScenario.id, updates)
                    }
                  />
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                        <IconSparkles className="size-3.5" />
                        Start with a recipe
                        <ContextHelp label="scenario recipes">
                          Recipes insert a sensible ordered set of test steps
                          for the services already in this workflow. Every
                          generated step remains editable.
                        </ContextHelp>
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {SCENARIO_RECIPES.map((recipe) => {
                          const availability = recipeAvailability(
                            recipe,
                            nodes,
                          );
                          return (
                            <Button
                              key={recipe.kind}
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={!availability.available}
                              title={availability.reason ?? recipe.description}
                              className="h-auto min-h-12 justify-start whitespace-normal px-3 py-2 text-left"
                              onClick={() => {
                                const recipeTests = createScenarioRecipe(
                                  recipe.kind,
                                  nodes,
                                );
                                const updated = [
                                  ...activeScenario.tests,
                                  ...recipeTests,
                                ];
                                updateScenario(activeScenario.id, {
                                  tests: updated,
                                  testOrder: updated.map((test) => test.id),
                                });
                                setExpandedTests(new Set());
                              }}
                            >
                              {recipe.label}
                            </Button>
                          );
                        })}
                      </div>
                    </div>

                    <Separator className="bg-border/60" />

                    {/* Tests section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-foreground/70">
                          Test steps
                          <span className="ml-2 border bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {activeScenario.tests.length}
                          </span>
                          <ContextHelp label="ordered test steps">
                            Steps run in the displayed order unless an explicit
                            test dependency requires another step first. Drag a
                            step to change its order.
                          </ContextHelp>
                        </h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          onClick={() => {
                            const newTest = createDefaultTest("http", nodes);
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
                        <div className="flex items-center justify-center border border-dashed border-border/60 py-8">
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
                                    const updatedTests =
                                      activeScenario.tests.map((t) =>
                                        t.id === test.id ? updated : t,
                                      );
                                    updateScenario(activeScenario.id, {
                                      tests: updatedTests,
                                      testOrder: updatedTests.map((t) => t.id),
                                    });
                                  }}
                                  availableServices={availableServices}
                                  serviceNodes={nodes}
                                  authoringMode={authoringMode}
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
                  </>
                )}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
