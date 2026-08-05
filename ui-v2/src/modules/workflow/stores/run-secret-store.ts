import { create } from "zustand";

export interface RunSecretScope {
  userId: string;
  projectId: string;
  workflowId: string;
}

type SecretValues = Record<
  string,
  Record<string, Record<string, Record<string, string>>>
>;

interface RunSecretStore {
  values: SecretValues;
  setSecret: (scope: RunSecretScope, secretRef: string, value: string) => void;
  getSecret: (scope: RunSecretScope, secretRef: string) => string | undefined;
  clearSecret: (scope: RunSecretScope, secretRef: string) => void;
  clearWorkflow: (workflowId: string) => void;
  clearAll: () => void;
}

function workflowValues(values: SecretValues, scope: RunSecretScope) {
  return values[scope.userId]?.[scope.projectId]?.[scope.workflowId];
}

// Run-secret values deliberately live only in this in-memory store. This
// module must never be wrapped in Zustand persistence or serialized into sync,
// browser storage, URLs, revisions, or workflow exports.
export const useRunSecretStore = create<RunSecretStore>((set, get) => ({
  values: {},
  setSecret: (scope, secretRef, value) =>
    set((state) => ({
      values: {
        ...state.values,
        [scope.userId]: {
          ...state.values[scope.userId],
          [scope.projectId]: {
            ...state.values[scope.userId]?.[scope.projectId],
            [scope.workflowId]: {
              ...workflowValues(state.values, scope),
              [secretRef]: value,
            },
          },
        },
      },
    })),
  getSecret: (scope, secretRef) =>
    workflowValues(get().values, scope)?.[secretRef],
  clearSecret: (scope, secretRef) =>
    set((state) => {
      const workflow = { ...workflowValues(state.values, scope) };
      delete workflow[secretRef];
      const project = { ...state.values[scope.userId]?.[scope.projectId] };
      if (Object.keys(workflow).length === 0) delete project[scope.workflowId];
      else project[scope.workflowId] = workflow;
      const user = { ...state.values[scope.userId] };
      if (Object.keys(project).length === 0) delete user[scope.projectId];
      else user[scope.projectId] = project;
      const values = { ...state.values };
      if (Object.keys(user).length === 0) delete values[scope.userId];
      else values[scope.userId] = user;
      return { values };
    }),
  clearWorkflow: (workflowId) =>
    set((state) => {
      const values: SecretValues = {};
      for (const [userId, projects] of Object.entries(state.values)) {
        for (const [projectId, workflows] of Object.entries(projects)) {
          const remaining = { ...workflows };
          delete remaining[workflowId];
          if (Object.keys(remaining).length > 0) {
            values[userId] ??= {};
            values[userId][projectId] = remaining;
          }
        }
      }
      return { values };
    }),
  clearAll: () => set({ values: {} }),
}));
