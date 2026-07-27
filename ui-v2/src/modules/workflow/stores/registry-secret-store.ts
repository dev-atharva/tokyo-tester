import { create } from "zustand";
import type { RegistryRuntimeConfig } from "../lib/registry-config";

interface SecretStore {
  secrets: Record<string, Record<string, RegistryRuntimeConfig>>;
  setSecret: (
    workflowId: string,
    nodeId: string,
    config: RegistryRuntimeConfig,
  ) => void;
  getSecret: (
    workflowId: string,
    nodeId: string,
  ) => RegistryRuntimeConfig | undefined;
  clearSecret: (workflowId: string, nodeId: string) => void;
  clearWorkflow: (workflowId: string) => void;
  clearAll: () => void;
}

// Registry credentials deliberately live only in memory. Persisting them in
// browser storage would expose reusable pull credentials to any script running
// on the same origin and would make logout/project switching harder to secure.
export const useRegistrySecretStore = create<SecretStore>((set, get) => ({
  secrets: {},
  setSecret: (workflowId, nodeId, config) =>
    set((state) => ({
      secrets: {
        ...state.secrets,
        [workflowId]: {
          ...state.secrets[workflowId],
          [nodeId]: config,
        },
      },
    })),
  getSecret: (workflowId, nodeId) => get().secrets[workflowId]?.[nodeId],
  clearSecret: (workflowId, nodeId) =>
    set((state) => {
      const workflowSecrets = { ...state.secrets[workflowId] };
      delete workflowSecrets[nodeId];
      const secrets = { ...state.secrets };
      if (Object.keys(workflowSecrets).length === 0) delete secrets[workflowId];
      else secrets[workflowId] = workflowSecrets;
      return { secrets };
    }),
  clearWorkflow: (workflowId) =>
    set((state) => {
      const secrets = { ...state.secrets };
      delete secrets[workflowId];
      return { secrets };
    }),
  clearAll: () => set({ secrets: {} }),
}));
