import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

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
  result?: unknown;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

interface ExecutionStore {
  executions: Record<string, WorkflowExecution>; // sessionId -> execution
  activeSessionId: string | null;

  // Execution lifecycle
  startExecution: (workflowId: string, sessionId: string) => void;
  appendLog: (sessionId: string, message: string) => void;
  completeExecution: (sessionId: string, result?: unknown) => void;
  failExecution: (sessionId: string, error: string) => void;

  // Queries
  getExecution: (sessionId: string) => WorkflowExecution | null;
  getActiveExecution: () => WorkflowExecution | null;
  getWorkflowExecutions: (workflowId: string) => WorkflowExecution[];

  // Cleanup
  clearExecution: (sessionId: string) => void;
  clearAllExecutions: () => void;
}

export const useExecutionStore = create<ExecutionStore>()(
  persist(
    (set, get) => ({
      executions: {},
      activeSessionId: null,

      startExecution: (workflowId, sessionId) =>
        set((state) => ({
          executions: {
            ...state.executions,
            [sessionId]: {
              sessionId,
              workflowId,
              status: "running",
              logs: [],
              startedAt: Date.now(),
            },
          },
          activeSessionId: sessionId,
        })),

      appendLog: (sessionId, message) =>
        set((state) => {
          const execution = state.executions[sessionId];
          if (!execution) {
            console.warn(`Execution ${sessionId} not found`);
            return state;
          }

          return {
            executions: {
              ...state.executions,
              [sessionId]: {
                ...execution,
                logs: [...execution.logs, message],
              },
            },
          };
        }),

      completeExecution: (sessionId, result) =>
        set((state) => {
          const execution = state.executions[sessionId];
          if (!execution) return state;

          return {
            executions: {
              ...state.executions,
              [sessionId]: {
                ...execution,
                status: "completed",
                result,
                finishedAt: Date.now(),
              },
            },
          };
        }),

      failExecution: (sessionId, error) =>
        set((state) => {
          const execution = state.executions[sessionId];
          if (!execution) return state;

          return {
            executions: {
              ...state.executions,
              [sessionId]: {
                ...execution,
                status: "failed",
                error,
                finishedAt: Date.now(),
              },
            },
          };
        }),

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

      clearExecution: (sessionId) =>
        set((state) => {
          const copy = { ...state.executions };
          delete copy[sessionId];
          return {
            executions: copy,
            activeSessionId:
              state.activeSessionId === sessionId
                ? null
                : state.activeSessionId,
          };
        }),

      clearAllExecutions: () =>
        set({
          executions: {},
          activeSessionId: null,
        }),
    }),
    {
      name: "execution-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
