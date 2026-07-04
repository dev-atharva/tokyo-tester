"use client";

import {
  IconApi,
  IconArrowRight,
  IconBolt,
  IconBrandDocker,
  IconCheck,
  IconClock,
  IconCode,
  IconDatabase,
  IconEye,
  IconMessage,
  IconPencil,
  IconPlayerPlay,
  IconX,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { friendlyName } from "../lib/architecture-view";
import {
  describeScenarioStep,
  orderedScenarioTests,
  scenarioServiceNames,
  scenarioSummary,
  TEST_INTENT_LABELS,
} from "../lib/scenario-journey";
import { useScenarioStore } from "../stores/scenario.store.sync";
import {
  type TestResult,
  useTestResultStore,
} from "../stores/test-result.store";
import type { ScenarioTestDefinition } from "../types/react-flow-cots";

interface ScenarioJourneyProps {
  workflowId: string;
  onConfigure: () => void;
  onFocusServices: (serviceNames: string[]) => void;
}

const typeIcons: Record<ScenarioTestDefinition["type"], typeof IconApi> = {
  http: IconApi,
  database: IconDatabase,
  document: IconDatabase,
  cache: IconBolt,
  queue: IconMessage,
  delay: IconClock,
  shell: IconCode,
};

export function ScenarioJourney({
  workflowId,
  onConfigure,
  onFocusServices,
}: ScenarioJourneyProps) {
  const scenariosMap = useScenarioStore((state) => state.scenarios);
  const activeScenarioId = useScenarioStore(
    (state) => state.activeScenarioIdByWorkflow[workflowId] ?? null,
  );
  const setActiveScenario = useScenarioStore(
    (state) => state.setActiveScenario,
  );
  const testResults = useTestResultStore((state) => state.testResults);
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
  const activeScenario =
    (activeScenarioId ? scenariosMap[activeScenarioId] : null) ??
    scenarios[0] ??
    null;
  const latestResults = useMemo(() => {
    if (!activeScenario) return new Map<string, TestResult>();
    const matching = Object.values(testResults)
      .filter(
        (result) =>
          !result.is_deleted && result.scenarioId === activeScenario.id,
      )
      .sort((left, right) => right.executedAt.localeCompare(left.executedAt));
    const byName = new Map<string, TestResult>();
    for (const result of matching) {
      if (!byName.has(result.testName)) byName.set(result.testName, result);
    }
    return byName;
  }, [activeScenario, testResults]);

  if (!activeScenario) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full border bg-muted/30 p-4">
          <IconPlayerPlay className="size-7 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">No scenario journey yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a scenario and add its first step in Configure mode.
          </p>
        </div>
        <Button onClick={onConfigure}>
          <IconPencil className="mr-2 size-4" />
          Configure scenarios
        </Button>
      </div>
    );
  }

  const steps = orderedScenarioTests(activeScenario);
  const services = scenarioServiceNames(activeScenario);
  const namesById = new Map(
    activeScenario.tests.map((test) => [test.id, test.name]),
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
        {scenarios.map((scenario) => (
          <button
            type="button"
            key={scenario.id}
            onClick={() => setActiveScenario(workflowId, scenario.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs transition-colors ${
              scenario.id === activeScenario.id
                ? "border-primary/40 bg-primary/10 font-semibold text-foreground"
                : "border-border/60 bg-background text-muted-foreground hover:bg-muted/40"
            }`}
          >
            {scenario.name}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-start justify-between gap-6 rounded-xl border bg-card p-4 shadow-sm">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
            Scenario journey
          </p>
          <h3 className="mt-1 text-lg font-semibold">{activeScenario.name}</h3>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
            {activeScenario.description || scenarioSummary(activeScenario)}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
              {services.length} service{services.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onFocusServices(services)}
            disabled={services.length === 0}
          >
            <IconEye className="mr-1.5 size-4" />
            Focus on graph
          </Button>
          <Button size="sm" variant="secondary" onClick={onConfigure}>
            <IconPencil className="mr-1.5 size-4" />
            Edit journey
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-4xl px-4 pb-6 pt-2">
          {steps.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <p className="text-sm font-medium">This journey has no steps.</p>
              <Button className="mt-3" size="sm" onClick={onConfigure}>
                Add the first step
              </Button>
            </div>
          ) : (
            <ol>
              {steps.map((step, index) => {
                const Icon = typeIcons[step.type] || IconBrandDocker;
                const result = latestResults.get(step.name);
                const dependencies = (step.dependsOnTestIds || [])
                  .map((id) => namesById.get(id))
                  .filter((name): name is string => Boolean(name));
                return (
                  <li
                    key={step.id}
                    className="relative flex gap-4 pb-5 last:pb-0"
                  >
                    {index < steps.length - 1 ? (
                      <div className="absolute left-[17px] top-9 h-[calc(100%-24px)] w-px bg-border" />
                    ) : null}
                    <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background shadow-sm">
                      <Icon className="size-4 text-primary" />
                    </div>
                    <article className="min-w-0 flex-1 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/25">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              Step {index + 1} · {TEST_INTENT_LABELS[step.type]}
                            </span>
                            <ResultStatus status={result?.status} />
                          </div>
                          <h4 className="mt-1 text-sm font-semibold">
                            {step.name || TEST_INTENT_LABELS[step.type]}
                          </h4>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {describeScenarioStep(step)}
                          </p>
                        </div>
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {(step.targetServices || []).map((service) => (
                          <span
                            key={service}
                            className="rounded-md border bg-muted/30 px-2 py-1 text-[10px] font-medium"
                          >
                            {friendlyName(service)}
                          </span>
                        ))}
                        {dependencies.length ? (
                          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <IconArrowRight className="size-3" />
                            after {dependencies.join(", ")}
                          </span>
                        ) : null}
                      </div>

                      <details className="mt-3 border-t pt-2 text-[10px] text-muted-foreground">
                        <summary className="cursor-pointer font-medium">
                          Technical details
                        </summary>
                        <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg bg-muted/30 p-2 font-mono">
                          <span>Executor: {step.type}</span>
                          <span>
                            Targets: {step.targetServices.join(", ") || "none"}
                          </span>
                        </div>
                      </details>
                    </article>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function ResultStatus({ status }: { status?: TestResult["status"] }) {
  if (!status) return null;
  const styles = {
    pending: "bg-muted text-muted-foreground",
    running: "bg-sky-500/10 text-sky-600",
    passed: "bg-emerald-500/10 text-emerald-600",
    failed: "bg-destructive/10 text-destructive",
  };
  const Icon =
    status === "passed" ? IconCheck : status === "failed" ? IconX : IconClock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ${styles[status]}`}
    >
      <Icon className="size-3" />
      {status}
    </span>
  );
}
