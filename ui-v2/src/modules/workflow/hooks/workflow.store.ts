import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import { FlowEdge, FlowNode } from "../types/react-flow-cots";

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
  status: ExecutionStatus;
  logs: string[];
  result?: any;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  executions: WorkflowExecution[];
  createdAt: number;
  activeSessionId?: string | null;
  customTestOrder: Record<string, string[]>;
}

interface WorkflowStore {
  workflows: Record<string, Workflow>;
  activeWorkflowId: string | null;

  createWorkflow: (name: string) => string;
  updateWorkflowName: (workflowId: string, name: string) => void;
  updateWorkflowGraph: (
    workflowId: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    customTestOrder?: Map<string, string[]>,
  ) => void;

  setActiveWorkflow: (id: string | null) => void;
  deleteWorkflow: (id: string) => void;

  startExecution: (workflowId: string, sessionId: string) => void;
  appendExecutionLog: (
    workflowId: string,
    sessionId: string,
    message: string,
  ) => void;
  completeExecution: (
    workflowId: string,
    sessionId: string,
    result?: any,
  ) => void;
  failExecution: (workflowId: string, sessionId: string, error: string) => void;
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set, get) => ({
      workflows: {},
      activeWorkflowId: null,

      createWorkflow: (name) => {
        const id = crypto.randomUUID();

        set((state) => ({
          workflows: {
            ...state.workflows,
            [id]: {
              id,
              name,
              nodes: [],
              edges: [],
              executions: [],
              createdAt: Date.now(),
              activeSessionId: null,
              customTestOrder: {},
            },
          },
          activeWorkflowId: id,
        }));

        return id;
      },

      updateWorkflowName: (workflowId, name) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) return state;

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: { ...wf, name },
            },
          };
        }),

      updateWorkflowGraph: (workflowId, nodes, edges, customTestOrder) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) return state;

          const testOrderRecord = customTestOrder
            ? Object.fromEntries(customTestOrder)
            : wf.customTestOrder || {};

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: {
                ...wf,
                nodes,
                edges,
                customTestOrder: testOrderRecord,
              },
            },
          };
        }),

      setActiveWorkflow: (id) => set({ activeWorkflowId: id }),

      deleteWorkflow: (id) =>
        set((state) => {
          const copy = { ...state.workflows };
          delete copy[id];
          return { workflows: copy };
        }),

      startExecution: (workflowId, sessionId) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) return state;

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: {
                ...wf,
                activeSessionId: sessionId,
                executions: [
                  ...wf.executions,
                  {
                    sessionId,
                    status: "running",
                    logs: [],
                    result: null,
                    startedAt: Date.now(),
                  },
                ],
              },
            },
          };
        }),

      appendExecutionLog: (workflowId, sessionId, message) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) {
            console.error("Workflow not found:", workflowId);
            return state;
          }

          const executions = wf.executions.some(
            (e) => e.sessionId === sessionId,
          )
            ? wf.executions.map((e) =>
                e.sessionId === sessionId
                  ? { ...e, logs: [...e.logs, message] }
                  : e,
              )
            : [
                ...wf.executions,
                {
                  sessionId,
                  status: "running" as ExecutionStatus,
                  logs: [message],
                  startedAt: Date.now(),
                },
              ];

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: {
                ...wf,
                executions,
              },
            },
          };
        }),

      completeExecution: (workflowId, sessionId, result) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) return state;

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: {
                ...wf,
                executions: wf.executions.map((e) =>
                  e.sessionId === sessionId
                    ? {
                        ...e,
                        status: "completed",
                        result,
                        finishedAt: Date.now(),
                      }
                    : e,
                ),
              },
            },
          };
        }),

      failExecution: (workflowId, sessionId, error) =>
        set((state) => {
          const wf = state.workflows[workflowId];
          if (!wf) return state;

          return {
            workflows: {
              ...state.workflows,
              [workflowId]: {
                ...wf,
                // activeSessionId:
                //   wf.activeSessionId === sessionId ? null : wf.activeSessionId,
                executions: wf.executions.map((e) =>
                  e.sessionId === sessionId
                    ? { ...e, status: "failed", error, finishedAt: Date.now() }
                    : e,
                ),
              },
            },
          };
        }),
    }),
    {
      name: "workflow-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
