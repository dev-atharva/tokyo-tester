import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { generateId } from "@/lib/generate-id";
import {
  addSyncMetadata,
  markAsDeleted,
  syncMiddleware,
  trackSync,
} from "@/modules/sync/sync-middleware";
import type { ScenarioRunStatus } from "../types/react-flow-cots";

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

export interface ScenarioRun {
  id: string;
  projectId: string;
  workflowRunId: string;
  workflowId: string;
  scenarioId: string;
  scenarioName: string;
  backendSessionId?: string;
  status: ScenarioRunStatus;
  result?: unknown;
  error?: string;
  logs: string[];
  startedAt: number;
  finishedAt?: number;
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

interface ScenarioRunStore {
  scenarioRuns: Record<string, ScenarioRun>;
  _currentEntityId: string | null;
  startScenarioRun: (
    projectId: string,
    workflowRunId: string,
    workflowId: string,
    scenarioId: string,
    scenarioName: string,
  ) => string;
  appendScenarioLog: (scenarioRunId: string, message: string) => void;
  updateScenarioRun: (
    scenarioRunId: string,
    updates: Partial<
      Pick<
        ScenarioRun,
        "backendSessionId" | "status" | "result" | "error" | "finishedAt"
      >
    >,
  ) => void;
  getScenarioRunsByWorkflowRun: (workflowRunId: string) => ScenarioRun[];
  upsertScenarioRunFromSync: (scenarioRun: ScenarioRun) => void;
  clearScenarioRun: (scenarioRunId: string) => void;
}

export const useScenarioRunStore = create<ScenarioRunStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        scenarioRuns: {},
        _currentEntityId: null,

        startScenarioRun: (
          projectId,
          workflowRunId,
          workflowId,
          scenarioId,
          scenarioName,
        ) => {
          const id = generateId();
          const scenarioRun: ScenarioRun = addSyncMetadata({
            id,
            projectId,
            workflowRunId,
            workflowId,
            scenarioId,
            scenarioName,
            status: "pending" as ScenarioRunStatus,
            logs: [],
            startedAt: Date.now(),
          });

          set((state) => ({
            scenarioRuns: {
              ...state.scenarioRuns,
              [id]: scenarioRun,
            },
            _currentEntityId: id,
          }));

          return id;
        },

        appendScenarioLog: (scenarioRunId, message) => {
          set((state) => {
            const run = state.scenarioRuns[scenarioRunId];
            if (!run) {
              return state;
            }

            return {
              scenarioRuns: {
                ...state.scenarioRuns,
                [scenarioRunId]: addSyncMetadata({
                  ...run,
                  logs: [...run.logs, message],
                  version: run.version + 1,
                }),
              },
              _currentEntityId: scenarioRunId,
            };
          });
        },

        updateScenarioRun: (scenarioRunId, updates) => {
          set((state) => {
            const run = state.scenarioRuns[scenarioRunId];
            if (!run) {
              return state;
            }

            return {
              scenarioRuns: {
                ...state.scenarioRuns,
                [scenarioRunId]: addSyncMetadata({
                  ...run,
                  ...updates,
                  finishedAt:
                    updates.finishedAt ??
                    (updates.status && updates.status !== "running"
                      ? Date.now()
                      : run.finishedAt),
                  version: run.version + 1,
                }),
              },
              _currentEntityId: scenarioRunId,
            };
          });
        },

        getScenarioRunsByWorkflowRun: (workflowRunId) =>
          Object.values(get().scenarioRuns)
            .filter(
              (run) => run.workflowRunId === workflowRunId && !run.is_deleted,
            )
            .sort((left, right) => left.startedAt - right.startedAt),

        upsertScenarioRunFromSync: (scenarioRun) => {
          set((state) => ({
            scenarioRuns: {
              ...state.scenarioRuns,
              [scenarioRun.id]: scenarioRun,
            },
          }));
        },

        clearScenarioRun: (scenarioRunId) => {
          trackSync(store, scenarioRunId, "delete");
          set((state) => {
            const run = state.scenarioRuns[scenarioRunId];
            if (!run) {
              return state;
            }
            return {
              scenarioRuns: {
                ...state.scenarioRuns,
                [scenarioRunId]: markAsDeleted(run),
              },
              _currentEntityId: scenarioRunId,
            };
          });
        },
      }),
      {
        entityType: "scenario_run",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const run = state.scenarioRuns[entityId];
          if (!run) {
            return null;
          }

          return {
            id: run.id,
            project_id: run.projectId,
            workflow_run_id: run.workflowRunId,
            workflow_id: run.workflowId,
            scenario_id: run.scenarioId,
            scenario_name: run.scenarioName,
            backend_session_id: run.backendSessionId || "",
            status: run.status,
            result: run.result,
            logs: run.logs,
            error: run.error || "",
            started_at: new Date(run.startedAt).toISOString(),
            completed_at: run.finishedAt
              ? new Date(run.finishedAt).toISOString()
              : null,
            version: run.version,
            created_at: run.created_at,
            updated_at: run.updated_at,
            user_id: run.user_id,
            client_id: run.client_id,
            is_deleted: run.is_deleted,
          };
        },
      },
    ),
    {
      name: "scenario-run-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
