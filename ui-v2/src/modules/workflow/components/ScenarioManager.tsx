"use client";

import { IconListDetails, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useScenarioStore } from "../stores/scenario.store.sync";
import type { FlowNode } from "../types/react-flow-cots";
import { TestConfigForm } from "./TestConfigForm";

interface ScenarioManagerProps {
  workflowId: string;
  nodes: FlowNode[];
}

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
        .filter(
          (scenario) =>
            scenario.workflowId === workflowId && !scenario.is_deleted,
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
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

  const availableServices = nodes.map((node) =>
    node.data.label
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, ""),
  );

  return (
    <div className="grid h-full min-h-0 gap-5 md:grid-cols-[280px_minmax(0,1fr)]">
      <div className="flex min-h-0  flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase flex items-center gap-2">
            <IconListDetails className="size-4" />
            Scenarios
          </h3>
          <span className="text-xs text-muted-foreground font-medium">
            {scenarios.length} total
          </span>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 shadow-sm p-3">
          <Button
            size="sm"
            onClick={() => {
              const id = createScenario(
                workflowId,
                `Scenario ${scenarios.length + 1}`,
              );
              setActiveScenario(workflowId, id);
            }}
            className="w-full shadow-sm"
          >
            <IconPlus className="mr-2 size-4" />
            New Scenario
          </Button>

          <ScrollArea className="flex-1">
            <div className="space-y-2 pr-2">
              {scenarios.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-center">
                  <p className="text-xs text-muted-foreground italic">
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
                      className={`w-full rounded-lg border p-3 text-left transition-all duration-200 ${
                        isActive
                          ? "border-primary bg-primary/10 shadow-md ring-2 ring-primary/20"
                          : "border-border/60 bg-background hover:bg-muted/50 hover:shadow-sm hover:border-border"
                      }`}
                    >
                      <div className="font-medium text-sm mb-1 truncate">
                        {scenario.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <div className="px-1.5 py-0.5 rounded bg-muted/60 font-medium">
                          {scenario.tests.length}
                        </div>
                        <span>tests</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="min-h-0 flex flex-col gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
          Scenario Details
        </h3>

        <div className="flex-1 min-h-0 rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
          {!activeScenario ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <div className="p-3 rounded-full bg-muted/50">
                <IconListDetails className="size-7 text-muted-foreground" />
              </div>
              <div className="text-center space-y-1">
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
              <div className="p-4 space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Scenario Name
                      </Label>
                      <Input
                        value={activeScenario.name}
                        onChange={(event) =>
                          updateScenario(activeScenario.id, {
                            name: event.target.value,
                          })
                        }
                        className="font-medium shadow-sm"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Description
                      </Label>
                      <Textarea
                        value={activeScenario.description || ""}
                        onChange={(event) =>
                          updateScenario(activeScenario.id, {
                            description: event.target.value,
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
                    className="shadow-sm"
                  >
                    <IconTrash className="mr-2 size-4" />
                    Delete
                  </Button>
                </div>

                <div className="pt-4 border-t">
                  <div className="mb-3">
                    <h4 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
                      Tests Configuration
                    </h4>
                  </div>
                  <TestConfigForm
                    tests={activeScenario.tests}
                    availableServices={availableServices}
                    onChange={(tests) =>
                      updateScenario(activeScenario.id, {
                        tests,
                        testOrder: tests.map((test) => test.id),
                      })
                    }
                  />
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
}
