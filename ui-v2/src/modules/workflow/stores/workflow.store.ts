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

export interface Workflow {
  id: string;
  name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  createdAt: number;
  customTestOrder: Record<string, string[]>;
}

interface WorkflowStore {
  workflows: Record<string, Workflow>;
  activeWorkflowId: string | null;

  // CRUD operations
  createWorkflow: (name: string) => string;
  getWorkflow: (id: string) => Workflow | null;
  updateWorkflowName: (workflowId: string, name: string) => void;
  updateWorkflowGraph: (
    workflowId: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    customTestOrder?: Map<string, string[]>,
  ) => void;
  deleteWorkflow: (id: string) => void;

  // Active workflow
  setActiveWorkflow: (id: string | null) => void;
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
              createdAt: Date.now(),
              customTestOrder: {},
            },
          },
          activeWorkflowId: id,
        }));

        return id;
      },

      getWorkflow: (id) => {
        return get().workflows[id] || null;
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

      deleteWorkflow: (id) =>
        set((state) => {
          const copy = { ...state.workflows };
          delete copy[id];
          return {
            workflows: copy,
            activeWorkflowId:
              state.activeWorkflowId === id ? null : state.activeWorkflowId,
          };
        }),

      setActiveWorkflow: (id) => set({ activeWorkflowId: id }),
    }),
    {
      name: "workflow-store",
      storage: createJSONStorage(() => indexedDBStorage),
    },
  ),
);
