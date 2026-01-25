import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
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

export type ExecutionStatus = "idle" | "running" | "completed" | "failed";

export interface WorkflowExecution {
  sessionId: string;
  workflowId: string;
  status: ExecutionStatus;
  logs: string[];
  result?: any;
  error?: string;
  startedAt: number;
  finishedAt?: number;

  // Sync metadata
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

interface ExecutionStore {
  executions: Record<string, WorkflowExecution>;
  activeSessionId: string | null;
  _currentEntityId: string | null;

  startExecution: (workflowId: string, sessionId: string) => void;
  appendLog: (sessionId: string, message: string) => void;
  completeExecution: (sessionId: string, result?: any) => void;
  failExecution: (sessionId: string, error: string) => void;

  getExecution: (sessionId: string) => WorkflowExecution | null;
  getActiveExecution: () => WorkflowExecution | null;
  getWorkflowExecutions: (workflowId: string) => WorkflowExecution[];

  clearExecution: (sessionId: string) => void;
  clearAllExecutions: () => void;

  upsertExecutionFromSync: (execution: WorkflowExecution) => void;
}

export const useExecutionStore = create<ExecutionStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        executions: {},
        activeSessionId: null,
        _currentEntityId: null,

        startExecution: (workflowId, sessionId) => {
          trackSync(store, sessionId, "insert");

          const execution: WorkflowExecution = addSyncMetadata({
            sessionId,
            workflowId,
            status: "running" as ExecutionStatus,
            logs: [],
            startedAt: Date.now(),
          });

          set((state) => ({
            executions: { ...state.executions, [sessionId]: execution },
            activeSessionId: sessionId,
            _currentEntityId: sessionId,
          }));
        },

        appendLog: (sessionId, message) => {
          trackSync(store, sessionId, "update");

          set((state) => {
            const execution = state.executions[sessionId];
            if (!execution) return state;

            return {
              executions: {
                ...state.executions,
                [sessionId]: addSyncMetadata({
                  ...execution,
                  logs: [...execution.logs, message],
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: sessionId,
            };
          });
        },

        completeExecution: (sessionId, result) => {
          trackSync(store, sessionId, "update");

          set((state) => {
            const execution = state.executions[sessionId];
            if (!execution) return state;

            return {
              executions: {
                ...state.executions,
                [sessionId]: addSyncMetadata({
                  ...execution,
                  status: "completed" as ExecutionStatus,
                  result,
                  finishedAt: Date.now(),
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: sessionId,
            };
          });
        },

        failExecution: (sessionId, error) => {
          trackSync(store, sessionId, "update");

          set((state) => {
            const execution = state.executions[sessionId];
            if (!execution) return state;

            return {
              executions: {
                ...state.executions,
                [sessionId]: addSyncMetadata({
                  ...execution,
                  status: "failed" as ExecutionStatus,
                  error,
                  finishedAt: Date.now(),
                  version: execution.version + 1,
                }),
              },
              _currentEntityId: sessionId,
            };
          });
        },

        getExecution: (sessionId) => {
          return get().executions[sessionId] || null;
        },

        getActiveExecution: () => {
          const { activeSessionId, executions } = get();
          return activeSessionId ? executions[activeSessionId] || null : null;
        },

        getWorkflowExecutions: (workflowId) => {
          return Object.values(get().executions).filter(
            (e) => e.workflowId === workflowId,
          );
        },

        clearExecution: (sessionId) => {
          trackSync(store, sessionId, "delete");

          set((state) => {
            const execution = state.executions[sessionId];
            if (!execution) return state;

            return {
              executions: {
                ...state.executions,
                [sessionId]: markAsDeleted(execution),
              },
              activeSessionId:
                state.activeSessionId === sessionId
                  ? null
                  : state.activeSessionId,
              _currentEntityId: sessionId,
            };
          });
        },

        clearAllExecutions: () => {
          set((state) => {
            const deletedExecutions: Record<string, WorkflowExecution> = {};

            Object.entries(state.executions).forEach(([id, execution]) => {
              deletedExecutions[id] = markAsDeleted(execution);
            });

            return {
              executions: deletedExecutions,
              activeSessionId: null,
            };
          });
        },

        upsertExecutionFromSync: (execution) => {
          set((state) => ({
            executions: {
              ...state.executions,
              [execution.sessionId]: execution,
            },
          }));
        },
      }),

      {
        entityType: "session",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const execution = state.executions[entityId];
          if (!execution) return null;

          return {
            id: execution.sessionId,
            workflow_id: execution.workflowId,
            status: execution.status,
            result: execution.result,
            container_ids: [],
            logs: execution.logs,
            error: execution.error || "",
            started_at: execution.startedAt
              ? new Date(execution.startedAt).toISOString()
              : null,
            completed_at: execution.finishedAt
              ? new Date(execution.finishedAt).toISOString()
              : null,
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
