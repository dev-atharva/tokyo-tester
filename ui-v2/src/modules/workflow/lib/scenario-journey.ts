import type {
  Scenario,
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
