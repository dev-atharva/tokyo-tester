import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addSyncMetadata,
  markAsDeleted,
  syncMiddleware,
  trackSync,
} from "@/modules/sync/sync-middleware";
import { isNewerEventId } from "../lib/realtime-events";
import type { WorkflowRunStatus } from "../types/react-flow-cots";

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

export interface WorkflowExecution {
  workflowRunId: string;
  projectId: string;
  workflowId: string;
  status: WorkflowRunStatus;
  logs: string[];
  result?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
  scenarioRunIds: string[];
  lastEventId?: string;

  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

interface ExecutionStore {
  executions: Record<string, WorkflowExecution>;
  activeWorkflowRunId: string | null;
  _currentEntityId: string | null;
  startExecution: (
    projectId: string,
    workflowId: string,
    workflowRunId: string,
    scenarioRunIds: string[],
  ) => void;
  appendLog: (workflowRunId: string, message: string) => void;
  completeExecution: (workflowRunId: string, result?: unknown) => void;
  failExecution: (workflowRunId: string, error: string) => void;
  updateExecutionStatus: (
    workflowRunId: string,
    status: WorkflowRunStatus,
    result?: unknown,
    error?: string,
  ) => void;
  updateReplayCursor: (workflowRunId: string, eventId: string) => void;
  getExecution: (workflowRunId: string) => WorkflowExecution | null;
  getActiveExecution: () => WorkflowExecution | null;
  getWorkflowExecutions: (workflowId: string) => WorkflowExecution[];
  clearExecution: (workflowRunId: string) => void;
  upsertExecutionFromSync: (execution: WorkflowExecution) => void;
}

export const useExecutionStore = create<ExecutionStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        executions: {},
        activeWorkflowRunId: null,
        _currentEntityId: null,

        startExecution: (
          projectId,
          workflowId,
          workflowRunId,
          scenarioRunIds,
        ) => {
          const execution: WorkflowExecution = addSyncMetadata({
            workflowRunId,
            projectId,
            workflowId,
            status: "pending" as WorkflowRunStatus,
            logs: [],
            startedAt: Date.now(),
            scenarioRunIds,
          });

          trackSync(store, workflowRunId, "insert");

          set((state) => ({
            executions: {
              ...state.executions,
              [workflowRunId]: execution,
            },
            activeWorkflowRunId: workflowRunId,
            _currentEntityId: workflowRunId,
          }));
        },

        appendLog: (workflowRunId, message) => {
          set((state) => {
            const execution = state.executions[workflowRunId];
            if (!execution) {
              return state;
            }

            return {
              executions: {
                ...state.executions,
                [workflowRunId]: addSyncMetadata({
                  ...execution,
                  logs: [...execution.logs, message],
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: workflowRunId,
            };
          });
        },

        completeExecution: (workflowRunId, result) => {
          get().updateExecutionStatus(workflowRunId, "completed", result);
        },

        failExecution: (workflowRunId, error) => {
          set((state) => {
            const execution = state.executions[workflowRunId];
            if (!execution) {
              return state;
            }

            return {
              executions: {
                ...state.executions,
                [workflowRunId]: addSyncMetadata({
                  ...execution,
                  status: "failed" as WorkflowRunStatus,
                  error,
                  finishedAt: Date.now(),
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: workflowRunId,
            };
          });
        },

        updateExecutionStatus: (workflowRunId, status, result, error) => {
          set((state) => {
            const execution = state.executions[workflowRunId];
            if (!execution) {
              return state;
            }

            return {
              executions: {
                ...state.executions,
                [workflowRunId]: addSyncMetadata({
                  ...execution,
                  status,
                  result: result ?? execution.result,
                  error: error ?? execution.error,
                  finishedAt:
                    status === "running" ? execution.finishedAt : Date.now(),
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: workflowRunId,
            };
          });
        },

        updateReplayCursor: (workflowRunId, eventId) => {
          set((state) => {
            const execution = state.executions[workflowRunId];
            if (!execution || !isNewerEventId(execution.lastEventId, eventId)) {
              return state;
            }
            return {
              executions: {
                ...state.executions,
                [workflowRunId]: { ...execution, lastEventId: eventId },
              },
            };
          });
        },

        getExecution: (workflowRunId) =>
          get().executions[workflowRunId] || null,

        getActiveExecution: () => {
          const { activeWorkflowRunId, executions } = get();
          return activeWorkflowRunId
            ? executions[activeWorkflowRunId] || null
            : null;
        },

        getWorkflowExecutions: (workflowId) =>
          Object.values(get().executions).filter(
            (execution) => execution.workflowId === workflowId,
          ),

        clearExecution: (workflowRunId) => {
          trackSync(store, workflowRunId, "delete");
          set((state) => {
            const execution = state.executions[workflowRunId];
            if (!execution) {
              return state;
            }

            return {
              executions: {
                ...state.executions,
                [workflowRunId]: markAsDeleted(execution),
              },
              activeWorkflowRunId:
                state.activeWorkflowRunId === workflowRunId
                  ? null
                  : state.activeWorkflowRunId,
              _currentEntityId: workflowRunId,
            };
          });
        },

        upsertExecutionFromSync: (execution) => {
          set((state) => ({
            executions: {
              ...state.executions,
              [execution.workflowRunId]: {
                ...execution,
                lastEventId:
                  state.executions[execution.workflowRunId]?.lastEventId,
              },
            },
          }));
        },
      }),
      {
        entityType: "workflow_run",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const execution = state.executions[entityId];
          if (!execution) {
            return null;
          }

          return {
            id: execution.workflowRunId,
            project_id: execution.projectId,
            workflow_id: execution.workflowId,
            status: execution.status,
            summary: execution.result,
            logs: execution.logs,
            error: execution.error || "",
            started_at: new Date(execution.startedAt).toISOString(),
            completed_at: execution.finishedAt
              ? new Date(execution.finishedAt).toISOString()
              : null,
            metadata: {
              scenario_run_ids: execution.scenarioRunIds,
            },
            version: execution.version,
            created_at: execution.created_at,
            updated_at: execution.updated_at,
            user_id: execution.user_id,
            client_id: execution.client_id,
            is_deleted: execution.is_deleted,
          };
        },
      },
    ),
    {
      name: "execution-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
