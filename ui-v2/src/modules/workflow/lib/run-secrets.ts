import type { Scenario } from "../types/react-flow-cots";

export interface RunSecretInput {
  secretRef: string;
  value: string;
}

export function deriveRequiredRunSecretRefs(scenarios: Scenario[]): string[] {
  const required = new Set<string>();
  for (const scenario of scenarios) {
    if (scenario.executionModel !== "journey") continue;
    for (const step of scenario.steps) {
      if (
        step.kind === "action" &&
        step.action.operation === "fill" &&
        step.action.value.source === "run-secret"
      ) {
        required.add(step.action.value.secretRef);
      }
    }
  }
  return [...required].sort();
}
