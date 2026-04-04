import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addSyncMetadata,
  markAsDeleted,
  syncMiddleware,
  trackSync,
} from "@/modules/sync/sync-middleware";

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

export type TestResultInput = Omit<
  TestResult,
  | "version"
  | "created_at"
  | "updated_at"
  | "user_id"
  | "client_id"
  | "is_deleted"
>;

export interface TestResult {
  id: string;
  projectId: string;
  sessionId: string;
  workflowRunId?: string;
  workflowId: string;
  scenarioRunId?: string;
  scenarioId?: string;
  scenarioName?: string;
  testName: string;
  testType: string; // database/http/shell/cache/kafka
  status: "pending" | "running" | "passed" | "failed";
  resultData: unknown;
  durationMs: number;
  executedAt: string;
  containerLogs?: Record<string, string>;

  // Sync metadata
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

interface TestResultStore {
  testResults: Record<string, TestResult>;
  _currentEntityId: string | null;

  // Actions
  addTestResult: (result: TestResultInput) => void;
  updateTestResult: (id: string, updates: Partial<TestResult>) => void;
  deleteTestResult: (id: string) => void;

  // Queries
  hasTestResult: (id: string) => boolean;
  getTestResult: (id: string) => TestResult | null;
  getTestResultsBySession: (sessionId: string) => TestResult[];
  getTestResultsByScenario: (scenarioId: string) => TestResult[];
  getTestResultsByWorkflow: (workflowId: string) => TestResult[];
  getAllTestResults: () => TestResult[];

  // Sync
  upsertTestResultFromSync: (result: TestResult) => void;
  clearAllTestResults: () => void;
}

export const useTestResultStore = create<TestResultStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        testResults: {},
        _currentEntityId: null,

        addTestResult: (result) => {
          const id = result.id;

          if (get().testResults[id]) {
            return;
          }
          trackSync(store, id, "insert");

          const testResult: TestResult = addSyncMetadata(result);

          set((state) => ({
            testResults: {
              ...state.testResults,
              [id]: testResult,
            },
            _currentEntityId: id,
          }));
        },

        updateTestResult: (id, updates) => {
          const existing = get().testResults[id];
          if (!existing) {
            const { sessionId, workflowId, testName, testType } = updates;
            if (!sessionId || !workflowId || !testName || !testType) {
              return;
            }

            trackSync(store, id, "insert");

            set((state) => ({
              testResults: {
                ...state.testResults,
                [id]: addSyncMetadata({
                  id,
                  projectId: updates.projectId ?? "",
                  sessionId,
                  workflowRunId: updates.workflowRunId,
                  workflowId,
                  scenarioRunId: updates.scenarioRunId,
                  scenarioId: updates.scenarioId,
                  scenarioName: updates.scenarioName,
                  testName,
                  testType,
                  status: updates.status ?? "pending",
                  resultData: updates.resultData ?? null,
                  durationMs: updates.durationMs ?? 0,
                  executedAt: updates.executedAt ?? new Date().toISOString(),
                  containerLogs: updates.containerLogs,
                }),
              },
              _currentEntityId: id,
            }));
            return;
          }

          trackSync(store, id, "update");

          set((state) => ({
            testResults: {
              ...state.testResults,
              [id]: addSyncMetadata({
                ...existing,
                ...updates,
                version: existing.version + 1,
              }),
            },
            _currentEntityId: id,
          }));
        },

        hasTestResult: (id) => {
          const result = get().testResults[id];
          return Boolean(result && !result.is_deleted);
        },

        deleteTestResult: (id) => {
          trackSync(store, id, "delete");

          set((state) => {
            const existing = state.testResults[id];
            if (!existing) return state;

            return {
              testResults: {
                ...state.testResults,
                [id]: markAsDeleted(existing),
              },
              _currentEntityId: id,
            };
          });
        },

        getTestResult: (id) => {
          const result = get().testResults[id];
          return result && !result.is_deleted ? result : null;
        },

        getTestResultsBySession: (sessionId) => {
          return Object.values(get().testResults).filter(
            (tr) => tr.sessionId === sessionId && !tr.is_deleted,
          );
        },

        getTestResultsByScenario: (scenarioId) => {
          return Object.values(get().testResults).filter(
            (tr) => tr.scenarioId === scenarioId && !tr.is_deleted,
          );
        },

        getTestResultsByWorkflow: (workflowId) => {
          return Object.values(get().testResults).filter(
            (tr) => tr.workflowId === workflowId && !tr.is_deleted,
          );
        },

        getAllTestResults: () => {
          return Object.values(get().testResults).filter(
            (tr) => !tr.is_deleted,
          );
        },

        upsertTestResultFromSync: (incoming) => {
          set((state) => {
            const existing = state.testResults[incoming.id];

            if (existing && existing.version > incoming.version) {
              return state;
            }

            return {
              testResults: {
                ...state.testResults,
                [incoming.id]: incoming,
              },
            };
          });
        },

        clearAllTestResults: () => {
          set((state) => {
            const deletedResults: Record<string, TestResult> = {};

            Object.entries(state.testResults).forEach(([id, result]) => {
              deletedResults[id] = markAsDeleted(result);
            });

            return {
              testResults: deletedResults,
            };
          });
        },
      }),
      {
        entityType: "test_result",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const result = state.testResults[entityId];
          if (!result) return null;

          return {
            id: result.id,
            project_id: result.projectId,
            session_id: result.sessionId,
            workflow_run_id: result.workflowRunId,
            workflow_id: result.workflowId,
            scenario_run_id: result.scenarioRunId,
            scenario_id: result.scenarioId,
            scenario_name: result.scenarioName,
            test_name: result.testName,
            test_type: result.testType,
            status: result.status,
            result_data: JSON.stringify(result.resultData),
            duration_ms: result.durationMs,
            executed_at: result.executedAt,
            container_logs: result.containerLogs
              ? JSON.stringify(result.containerLogs)
              : null,
            created_at: result.created_at,
            updated_at: result.updated_at,
            user_id: result.user_id,
            client_id: result.client_id,
            is_deleted: result.is_deleted,
          };
        },
      },
    ),
    {
      name: "test-result-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
