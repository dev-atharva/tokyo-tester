"use client";

import { IconListDetails, IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useScenarioStore } from "../stores/scenario.store.sync";
import type { FlowNode } from "../types/react-flow-cots";
import { TestConfigForm } from "./TestConfigForm";

interface ScenarioManagerProps {
  workflowId: string;
  nodes: FlowNode[];
}

export function ScenarioManager({
  workflowId,
  nodes,
}: ScenarioManagerProps) {
  const createScenario = useScenarioStore((state) => state.createScenario);
  const updateScenario = useScenarioStore((state) => state.updateScenario);
  const deleteScenario = useScenarioStore((state) => state.deleteScenario);
  const setActiveScenario = useScenarioStore((state) => state.setActiveScenario);
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
    <div className="grid h-full min-h-0 gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col rounded-lg border p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium">
            <IconListDetails className="size-4" />
            Scenarios
          </div>
          <Button
            size="sm"
            onClick={() => {
              const id = createScenario(workflowId, `Scenario ${scenarios.length + 1}`);
              setActiveScenario(workflowId, id);
            }}
          >
            <IconPlus className="mr-1 size-4" />
            Add
          </Button>
        </div>

        <ScrollArea className="mt-3 min-h-0 flex-1">
          <div className="space-y-2">
            {scenarios.map((scenario) => (
              <button
                type="button"
                key={scenario.id}
                onClick={() => setActiveScenario(workflowId, scenario.id)}
                className={`w-full rounded-md border px-3 py-2 text-left text-sm ${
                  activeScenario?.id === scenario.id
                    ? "border-primary bg-primary/10"
                    : "hover:bg-muted"
                }`}
              >
                <div className="font-medium">{scenario.name}</div>
                <div className="text-xs text-muted-foreground">
                  {scenario.tests.length} test(s)
                </div>
              </button>
            ))}
            {scenarios.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Create a scenario to attach tests to this workflow.
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      <div className="min-h-0 rounded-lg border">
        {!activeScenario ? (
          <div className="flex h-full min-h-72 items-center justify-center px-6 text-sm text-muted-foreground">
            Select a scenario or create a new one.
          </div>
        ) : (
          <ScrollArea className="h-full overflow-auto">
            <div className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3 ">
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <Label>Scenario Name</Label>
                    <Input
                      value={activeScenario.name}
                      onChange={(event) =>
                        updateScenario(activeScenario.id, {
                          name: event.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={activeScenario.description || ""}
                      onChange={(event) =>
                        updateScenario(activeScenario.id, {
                          description: event.target.value,
                        })
                      }
                      placeholder="What does this scenario verify?"
                    />
                  </div>
                </div>

                <Button
                  variant="destructive"
                  onClick={() => deleteScenario(activeScenario.id)}
                >
                  <IconTrash className="mr-1 size-4" />
                  Delete
                </Button>
              </div>

              <Separator />

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
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
