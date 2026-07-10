import { describe, expect, test } from "bun:test";
import type { Scenario } from "../types/react-flow-cots";
import { selectScenariosForRun } from "./useWorkflowExecution";

const scenarios = [
  { id: "one", workflowId: "workflow", is_deleted: false },
  { id: "two", workflowId: "workflow", is_deleted: false },
] as Scenario[];

describe("selectScenariosForRun", () => {
  test("defaults an omitted selection to all scenarios", () => {
    expect(selectScenariosForRun(scenarios, "workflow")).toEqual(scenarios);
  });

  test("keeps only the explicitly selected scenarios", () => {
    expect(selectScenariosForRun(scenarios, "workflow", ["two"])).toEqual([
      scenarios[1],
    ]);
  });

  test("rejects empty, duplicate, and stale selections", () => {
    expect(() => selectScenariosForRun(scenarios, "workflow", [])).toThrow();
    expect(() =>
      selectScenariosForRun(scenarios, "workflow", ["one", "one"]),
    ).toThrow();
    expect(() =>
      selectScenariosForRun(scenarios, "workflow", ["missing"]),
    ).toThrow();
  });
});
