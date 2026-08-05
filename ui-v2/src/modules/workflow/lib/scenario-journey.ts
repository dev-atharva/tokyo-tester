import type {
  FlowNode,
  Scenario,
  ScenarioStep,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import { friendlyName } from "./architecture-view";

export const TEST_INTENT_LABELS: Record<
  ScenarioTestDefinition["type"],
  string
> = {
  http: "Call an API",
  database: "Check stored data",
  queue: "Check a message",
  cache: "Check cached data",
  document: "Check a document",
  delay: "Wait for something",
  shell: "Run an advanced command",
};

export function orderedScenarioTests(
  scenario: Pick<Scenario, "tests" | "testOrder">,
): ScenarioTestDefinition[] {
  const byId = new Map(scenario.tests.map((test) => [test.id, test]));
  const ordered = scenario.testOrder
    .map((id) => byId.get(id))
    .filter((test): test is ScenarioTestDefinition => Boolean(test));
  const seen = new Set(ordered.map((test) => test.id));
  return [...ordered, ...scenario.tests.filter((test) => !seen.has(test.id))];
}

export const JOURNEY_OPERATION_LABELS = {
  navigate: "Navigate",
  fill: "Fill field",
  click: "Click element",
  url: "Match URL",
  visible: "Element is visible",
  delay: "Wait",
} as const;

export type JourneyOperation = keyof typeof JOURNEY_OPERATION_LABELS;

export interface BrowserTargetOption {
  service: string;
  label: string;
  ports: string[];
}

export interface JourneyValidationIssue {
  field: string;
  message: string;
  stepId?: string;
}

export interface JourneyValidation {
  valid: boolean;
  issues: JourneyValidationIssue[];
  byField: Record<string, string>;
}

export function orderedScenarioSteps(
  scenario: Pick<Scenario, "steps" | "stepOrder">,
): ScenarioStep[] {
  const byId = new Map(scenario.steps.map((step) => [step.id, step]));
  const ordered = scenario.stepOrder
    .map((id) => byId.get(id))
    .filter((step): step is ScenarioStep => Boolean(step));
  const seen = new Set(ordered.map((step) => step.id));
  return [...ordered, ...scenario.steps.filter((step) => !seen.has(step.id))];
}

export function journeyStepOperation(step: ScenarioStep): JourneyOperation {
  if (step.kind === "action") return step.action.operation;
  if (step.kind === "assertion") return step.assertion.operation;
  return step.control.operation;
}

export function browserTargetOptions(nodes: FlowNode[]): BrowserTargetOption[] {
  return nodes
    .map((node) => ({
      service: node.data.label
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, ""),
      label: friendlyName(node.data.label),
      ports: Array.from(
        new Set(
          (node.data.service.ports || [])
            .map((port) => port.containerPort.trim())
            .filter(Boolean),
        ),
      ),
    }))
    .filter((option) => option.service && option.ports.length > 0);
}

export function validateBrowserJourney(
  scenario: Pick<
    Scenario,
    "name" | "executionModel" | "environment" | "steps" | "stepOrder"
  >,
  nodes: FlowNode[],
): JourneyValidation {
  const issues: JourneyValidationIssue[] = [];
  const add = (field: string, message: string, stepId?: string) =>
    issues.push({ field, message, stepId });
  const targets = browserTargetOptions(nodes);
  const environment = scenario.environment;

  if (scenario.executionModel !== "journey") {
    return { valid: true, issues: [], byField: {} };
  }
  if (!scenario.name.trim()) add("name", "Give this journey a name.");
  if (!environment?.browser.targetService.trim()) {
    add("environment.targetService", "Choose the service the browser opens.");
  } else {
    const target = targets.find(
      (option) => option.service === environment.browser.targetService,
    );
    if (!target) {
      add(
        "environment.targetService",
        "Choose a workflow service that exposes a container port.",
      );
    } else if (!target.ports.includes(environment.browser.targetPort)) {
      add(
        "environment.targetPort",
        "Choose one of the target service's exposed container ports.",
      );
    }
  }
  if (!environment?.browser.targetPort.trim()) {
    add("environment.targetPort", "Choose the container port to open.");
  }

  const ordered = orderedScenarioSteps(scenario);
  if (ordered.length === 0) {
    add("steps", "Add at least one browser step.");
  }
  if (
    scenario.stepOrder.length !== scenario.steps.length ||
    new Set(scenario.stepOrder).size !== scenario.steps.length ||
    scenario.stepOrder.some(
      (id) => !scenario.steps.some((step) => step.id === id),
    )
  ) {
    add("steps", "Every step must appear exactly once in the journey order.");
  }

  for (const step of ordered) {
    const field = (suffix: string) => `steps.${step.id}.${suffix}`;
    if (!step.name.trim())
      add(field("name"), "Give this step a name.", step.id);
    if (step.timeoutMs !== undefined && step.timeoutMs < 0) {
      add(field("timeoutMs"), "Timeout cannot be negative.", step.id);
    }
    const config =
      step.kind === "action"
        ? step.action
        : step.kind === "assertion"
          ? step.assertion
          : step.control;
    if ("path" in config && !config.path.startsWith("/")) {
      add(
        field("path"),
        "Use an origin-relative path beginning with /.",
        step.id,
      );
    }
    if ("locator" in config) {
      const locator = config.locator;
      if (locator.strategy === "role") {
        if (!locator.role.trim()) {
          add(field("locator.role"), "Choose an accessible role.", step.id);
        }
        if (!locator.name.trim()) {
          add(
            field("locator.name"),
            "Enter the element's accessible name.",
            step.id,
          );
        }
      } else if (!locator.value.trim()) {
        add(field("locator.value"), "Enter a locator value.", step.id);
      }
    }
    if (step.kind === "action" && step.action.operation === "fill") {
      const value = step.action.value;
      if (value.source === "run-secret" && !value.secretRef.trim()) {
        add(field("value.secretRef"), "Enter a run-secret reference.", step.id);
      }
    }
    if (
      step.kind === "control" &&
      (!Number.isFinite(step.control.durationMs) || step.control.durationMs < 0)
    ) {
      add(field("durationMs"), "Wait duration cannot be negative.", step.id);
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    byField: Object.fromEntries(
      issues.map((issue) => [issue.field, issue.message]),
    ),
  };
}

export function scenarioServiceNames(
  scenario: Pick<Scenario, "tests">,
): string[] {
  return Array.from(
    new Set(scenario.tests.flatMap((test) => test.targetServices || [])),
  );
}

export function describeScenarioStep(test: ScenarioTestDefinition): string {
  const target = test.targetServices[0]
    ? friendlyName(test.targetServices[0])
    : "a service";

  switch (test.type) {
    case "http": {
      const method = test.httpConfig?.method || "GET";
      const path = test.httpConfig?.path || "/";
      const expected = test.httpConfig?.expectedStatus;
      return `${method} ${path} on ${target}${expected ? ` and expect ${expected}` : ""}`;
    }
    case "database":
      return `Verify data stored in ${target}`;
    case "document":
      return `Verify ${test.documentConfig?.collection || "a document collection"} in ${target}`;
    case "cache": {
      const operation = test.cacheConfig?.operation || "check";
      const key = test.cacheConfig?.key;
      return `${friendlyName(operation)}${key ? ` “${key}”` : ""} in ${target}`;
    }
    case "queue": {
      const operation = test.queueConfig?.operation || "check";
      const topic = test.queueConfig?.topic;
      return `${friendlyName(operation)}${topic ? ` on “${topic}”` : ""} through ${target}`;
    }
    case "delay":
      return `Wait ${formatDuration(test.delayConfig?.durationMs || 0)} before continuing`;
    case "shell":
      return `Run an advanced verification command`;
  }
}

export function scenarioSummary(scenario: Pick<Scenario, "tests">): string {
  const services = scenarioServiceNames(scenario);
  const intents = new Set(scenario.tests.map((test) => test.type));
  const phrases: string[] = [];
  if (intents.has("http")) phrases.push("calls application APIs");
  if (intents.has("database") || intents.has("document")) {
    phrases.push("verifies stored data");
  }
  if (intents.has("queue")) phrases.push("checks asynchronous messages");
  if (intents.has("cache")) phrases.push("confirms cached state");
  if (phrases.length === 0)
    phrases.push("validates the expected workflow behavior");
  return `This journey ${joinPhrases(phrases)} across ${services.length} service${services.length === 1 ? "" : "s"}.`;
}

function formatDuration(durationMs: number): string {
  if (durationMs >= 1000 && durationMs % 1000 === 0) {
    return `${durationMs / 1000} second${durationMs === 1000 ? "" : "s"}`;
  }
  return `${durationMs} ms`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 1) return phrases[0];
  if (phrases.length === 2) return `${phrases[0]} and ${phrases[1]}`;
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases.at(-1)}`;
}
