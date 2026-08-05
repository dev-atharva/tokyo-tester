import { describe, expect, test } from "bun:test";
import { docsEntries } from "@/modules/docs/registry";
import type { Scenario } from "../types/react-flow-cots";
import {
  builderModeStorageKey,
  checklistStorageKey,
  deriveGuidedChecklist,
  GUIDED_DOCUMENTATION,
  persistBuilderMode,
  persistChecklistDismissal,
  readBuilderExperience,
} from "./builder-experience";

describe("builder experience", () => {
  test("defaults first-time and invalid preferences to guided mode", () => {
    const storage = memoryStorage();
    expect(readBuilderExperience(storage, "user-1")).toEqual({
      mode: "guided",
      checklistDismissed: false,
    });
    storage.setItem(builderModeStorageKey("user-1"), "automatic");
    expect(readBuilderExperience(storage, "user-1").mode).toBe("guided");
  });

  test("persists mode and checklist preferences per user", () => {
    const storage = memoryStorage();
    expect(persistBuilderMode(storage, "user-1", "expert")).toBe(true);
    expect(persistChecklistDismissal(storage, "user-1", true)).toBe(true);
    expect(readBuilderExperience(storage, "user-1")).toEqual({
      mode: "expert",
      checklistDismissed: true,
    });
    expect(readBuilderExperience(storage, "user-2")).toEqual({
      mode: "guided",
      checklistDismissed: false,
    });
    expect(checklistStorageKey("user-1")).not.toBe(
      checklistStorageKey("user-2"),
    );
  });

  test("falls back safely when browser storage is unavailable", () => {
    const storage = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    };
    expect(readBuilderExperience(storage, "user-1")).toEqual({
      mode: "guided",
      checklistDismissed: false,
    });
    expect(persistBuilderMode(storage, "user-1", "expert")).toBe(false);
    expect(persistChecklistDismissal(storage, "user-1", true)).toBe(false);
  });

  test("derives checklist states without making connections mandatory", () => {
    expect(
      deriveGuidedChecklist({
        serviceCount: 0,
        edges: [],
        scenarios: [],
        validationErrorCount: 0,
      }).map((item) => item.status),
    ).toEqual(["pending", "optional", "pending", "pending"]);

    const scenarios = [scenarioWithTests()];
    expect(
      deriveGuidedChecklist({
        serviceCount: 2,
        edges: [],
        scenarios,
        validationErrorCount: 0,
      }).map((item) => item.status),
    ).toEqual(["complete", "review", "complete", "ready"]);

    expect(
      deriveGuidedChecklist({
        serviceCount: 2,
        edges: [
          {
            id: "edge-1",
            source: "app",
            target: "db",
            data: {
              relation: "calls",
              readiness: "source_requires_target",
              needsReview: false,
            },
          },
        ],
        scenarios,
        validationErrorCount: 1,
      }).map((item) => item.status),
    ).toEqual(["complete", "complete", "complete", "pending"]);
  });

  test("maps every contextual help destination to registered documentation", () => {
    for (const destination of Object.values(GUIDED_DOCUMENTATION)) {
      const url = new URL(destination.href, "https://tokyo-tester.local");
      const slug = url.pathname.replace(/^\/docs\//, "");
      const entry = docsEntries.find((item) => item.slug === slug);
      expect(entry, destination.href).toBeDefined();
      if (url.hash) {
        expect(
          entry?.headings.some((heading) => `#${heading.id}` === url.hash),
          destination.href,
        ).toBe(true);
      }
    }
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function scenarioWithTests(): Scenario {
  return {
    id: "scenario-1",
    projectId: "project-1",
    workflowId: "workflow-1",
    name: "Scenario",
    executionModel: "legacy-tests",
    tests: [
      {
        id: "test-1",
        name: "Health",
        type: "http",
        targetServices: ["app"],
      },
    ],
    testOrder: ["test-1"],
    steps: [],
    stepOrder: [],
    version: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    user_id: "user-1",
    client_id: "client-1",
    is_deleted: false,
  };
}
