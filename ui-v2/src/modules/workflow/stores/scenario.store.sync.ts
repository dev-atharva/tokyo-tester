import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addSyncMetadata,
  markAsDeleted,
  syncMiddleware,
  trackSync,
} from "@/modules/sync/sync-middleware";
import type { Scenario, ScenarioTestDefinition } from "../types/react-flow-cots";

const indexedDBStorage = {
  getItem: async (name: string) => {
    const value = await get(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string) => {
    await set(name, value);
  },
  removeItem: async (name: string) => {
    await del(name);
  },
};

type ScenarioInput = Omit<
  Scenario,
  "version" | "created_at" | "updated_at" | "user_id" | "client_id" | "is_deleted"
>;

interface ScenarioStore {
  scenarios: Record<string, Scenario>;
  activeScenarioIdByWorkflow: Record<string, string | null>;
  _currentEntityId: string | null;
  createScenario: (workflowId: string, name?: string) => string;
  updateScenario: (
    scenarioId: string,
    updates: Partial<Pick<Scenario, "name" | "description" | "tests" | "testOrder">>,
  ) => void;
  deleteScenario: (scenarioId: string) => void;
  setActiveScenario: (workflowId: string, scenarioId: string | null) => void;
  getScenario: (scenarioId: string) => Scenario | null;
  getScenariosByWorkflow: (workflowId: string) => Scenario[];
  getActiveScenarioForWorkflow: (workflowId: string) => Scenario | null;
  upsertScenarioFromSync: (scenario: Scenario) => void;
}

function deriveOrder(tests: ScenarioTestDefinition[], order?: string[]) {
  const existing = order?.filter((id) => tests.some((test) => test.id === id)) ?? [];
  const missing = tests
    .map((test) => test.id)
    .filter((id) => !existing.includes(id));
  return [...existing, ...missing];
}

export const useScenarioStore = create<ScenarioStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        scenarios: {},
        activeScenarioIdByWorkflow: {},
        _currentEntityId: null,

        createScenario: (workflowId, name = "New Scenario") => {
          const id = crypto.randomUUID();
          const scenario: Scenario = addSyncMetadata({
            id,
            workflowId,
            name,
            description: "",
            tests: [],
            testOrder: [],
          } satisfies ScenarioInput);

          trackSync(store, id, "insert");

          set((state) => ({
            scenarios: {
              ...state.scenarios,
              [id]: scenario,
            },
            activeScenarioIdByWorkflow: {
              ...state.activeScenarioIdByWorkflow,
              [workflowId]: id,
            },
            _currentEntityId: id,
          }));

          return id;
        },

        updateScenario: (scenarioId, updates) => {
          const scenario = get().scenarios[scenarioId];
          if (!scenario) {
            return;
          }

          trackSync(store, scenarioId, "update");

          set((state) => {
            const current = state.scenarios[scenarioId];
            if (!current) {
              return state;
            }

            const nextTests = updates.tests ?? current.tests;
            const nextOrder = deriveOrder(nextTests, updates.testOrder ?? current.testOrder);

            return {
              scenarios: {
                ...state.scenarios,
                [scenarioId]: addSyncMetadata({
                  ...current,
                  ...updates,
                  tests: nextTests,
                  testOrder: nextOrder,
                  version: current.version + 1,
                }),
              },
              _currentEntityId: scenarioId,
            };
          });
        },

        deleteScenario: (scenarioId) => {
          const scenario = get().scenarios[scenarioId];
          if (!scenario) {
            return;
          }

          trackSync(store, scenarioId, "delete");
          set((state) => ({
            scenarios: {
              ...state.scenarios,
              [scenarioId]: markAsDeleted(state.scenarios[scenarioId]),
            },
            activeScenarioIdByWorkflow: {
              ...state.activeScenarioIdByWorkflow,
              [scenario.workflowId]:
                state.activeScenarioIdByWorkflow[scenario.workflowId] === scenarioId
                  ? null
                  : state.activeScenarioIdByWorkflow[scenario.workflowId],
            },
            _currentEntityId: scenarioId,
          }));
        },

        setActiveScenario: (workflowId, scenarioId) => {
          set((state) => ({
            activeScenarioIdByWorkflow: {
              ...state.activeScenarioIdByWorkflow,
              [workflowId]: scenarioId,
            },
          }));
        },

        getScenario: (scenarioId) => get().scenarios[scenarioId] || null,

        getScenariosByWorkflow: (workflowId) =>
          Object.values(get().scenarios)
            .filter(
              (scenario) =>
                scenario.workflowId === workflowId && !scenario.is_deleted,
            )
            .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),

        getActiveScenarioForWorkflow: (workflowId) => {
          const activeId = get().activeScenarioIdByWorkflow[workflowId];
          if (activeId) {
            return get().scenarios[activeId] || null;
          }
          return get().getScenariosByWorkflow(workflowId)[0] || null;
        },

        upsertScenarioFromSync: (scenario) => {
          set((state) => ({
            scenarios: {
              ...state.scenarios,
              [scenario.id]: scenario,
            },
            activeScenarioIdByWorkflow: {
              ...state.activeScenarioIdByWorkflow,
              [scenario.workflowId]:
                state.activeScenarioIdByWorkflow[scenario.workflowId] ?? scenario.id,
            },
          }));
        },
      }),
      {
        entityType: "scenario",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const scenario = state.scenarios[entityId];
          if (!scenario) {
            return null;
          }

          return {
            id: scenario.id,
            workflow_id: scenario.workflowId,
            name: scenario.name,
            description: scenario.description || "",
            tests_config: scenario.tests,
            test_order: scenario.testOrder,
            metadata: {},
            version: scenario.version,
            created_at: scenario.created_at,
            updated_at: scenario.updated_at,
            user_id: scenario.user_id,
            client_id: scenario.client_id,
            is_deleted: scenario.is_deleted,
          };
        },
      },
    ),
    {
      name: "scenario-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
