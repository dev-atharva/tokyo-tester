import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  addSyncMetadata,
  markAsDeleted,
  syncMiddleware,
  trackSync,
} from "@/modules/sync/sync-middleware";
import type { FlowEdge, FlowNode } from "../types/react-flow-cots";

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
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  customTestOrder: Record<string, string[]>;

  // Sync metadata
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

interface WorkflowStore {
  workflows: Record<string, Workflow>;
  activeWorkflowId: string | null;
  _currentEntityId: string | null;

  hydrated: boolean;
  setHydrated: (v: boolean) => void;

  createWorkflow: (name: string, description?: string) => string;
  getWorkflow: (id: string) => Workflow | null;
  updateWorkflowName: (workflowId: string, name: string) => void;
  updateWorkflowGraph: (
    workflowId: string,
    nodes: FlowNode[],
    edges: FlowEdge[],
    customTestOrder?: Map<string, string[]>,
  ) => void;
  deleteWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;
  upsertWorkflowFromSync: (workflow: Workflow) => void;
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    syncMiddleware(
      (set, get, store) => ({
        workflows: {},
        activeWorkflowId: null,
        _currentEntityId: null,
        hydrated: false,
        setHydrated: (v) => set({ hydrated: v }),

        createWorkflow: (name, description) => {
          const id = crypto.randomUUID();
          const workflow: Workflow = addSyncMetadata({
            id,
            name,
            description: description || "",
            nodes: [],
            edges: [],
            customTestOrder: {},
          });

          trackSync(store, id, "insert");

          set((state) => ({
            workflows: { ...state.workflows, [id]: workflow },
            activeWorkflowId: id,
            _currentEntityId: id,
          }));

          return id;
        },

        getWorkflow: (id) => {
          return get().workflows[id] || null;
        },

        updateWorkflowName: (workflowId, name) => {
          trackSync(store, workflowId, "update");

          set((state) => {
            const wf = state.workflows[workflowId];
            if (!wf) return state;

            return {
              workflows: {
                ...state.workflows,
                [workflowId]: addSyncMetadata({
                  ...wf,
                  name,
                  version: wf.version + 1,
                }),
              },
              _currentEntityId: workflowId,
            };
          });
        },

        updateWorkflowGraph: (workflowId, nodes, edges, customTestOrder) => {
          trackSync(store, workflowId, "update");

          set((state) => {
            const wf = state.workflows[workflowId];
            if (!wf) return state;

            const testOrderRecord = customTestOrder
              ? Object.fromEntries(customTestOrder)
              : wf.customTestOrder || {};

            return {
              workflows: {
                ...state.workflows,
                [workflowId]: addSyncMetadata({
                  ...wf,
                  nodes,
                  edges,
                  customTestOrder: testOrderRecord,
                  version: wf.version + 1,
                }),
              },
              _currentEntityId: workflowId,
            };
          });
        },

        deleteWorkflow: (id) => {
          trackSync(store, id, "delete");

          set((state) => {
            const wf = state.workflows[id];
            if (!wf) return state;

            return {
              workflows: {
                ...state.workflows,
                [id]: markAsDeleted(wf),
              },
              activeWorkflowId:
                state.activeWorkflowId === id ? null : state.activeWorkflowId,
              _currentEntityId: id,
            };
          });
        },

        setActiveWorkflow: (id) => {
          set({ activeWorkflowId: id });
        },

        upsertWorkflowFromSync: (workflow) => {
          set((state) => ({
            workflows: {
              ...state.workflows,
              [workflow.id]: workflow,
            },
          }));
        },
      }),

      {
        entityType: "workflow",
        getEntityId: (state) => state._currentEntityId,
        serializeEntity: (state, entityId) => {
          const workflow = state.workflows[entityId];
          if (!workflow) return null;

          return {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description || "",
            nodes_config: workflow.nodes,
            edges_config: workflow.edges,
            metadata: { customTestOrder: workflow.customTestOrder },
            version: workflow.version,
            created_at: workflow.created_at,
            updated_at: workflow.updated_at,
            user_id: workflow.user_id,
            client_id: workflow.client_id,
            is_deleted: workflow.is_deleted,
          };
        },
      },
    ),
    {
      name: "workflow-store",
      storage: createJSONStorage(() => indexedDBStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
