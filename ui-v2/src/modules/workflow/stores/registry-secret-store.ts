import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { decrypt, encrypt } from "@/modules/utils/crypto-utils";

const encryptedSessionStorage = {
  getItem: (name: string) => {
    if (typeof window === "undefined") return null;

    const value = sessionStorage.getItem(name);
    if (!value) return null;

    try {
      return decrypt(value);
    } catch {
      return null;
    }
  },

  setItem: (name: string, value: string) => {
    if (typeof window === "undefined") return;

    const encrypted = encrypt(value);
    sessionStorage.setItem(name, encrypted);
  },

  removeItem: (name: string) => {
    if (typeof window === "undefined") return;
    sessionStorage.removeItem(name);
  },
};

interface RegistryRuntimeConfig {
  url?: string;
  auth_type?: "basic" | "token";
  username?: string;
  password?: string;
  token?: string;
}

interface SecretStore {
  secrets: Record<string, RegistryRuntimeConfig>;

  setSecret: (serviceId: string, config: RegistryRuntimeConfig) => void;
  getSecret: (serviceId: string) => RegistryRuntimeConfig | undefined;
  clearSecret: (serviceId: string) => void;
  clearAll: () => void;
}

export const useRegistrySecretStore = create<SecretStore>()(
  persist(
    (set, get) => ({
      secrets: {},
      hasHydrated: false,
      setSecret: (serviceId, secret) =>
        set((state) => ({
          secrets: {
            ...state.secrets,
            [serviceId]: secret,
          },
        })),

      getSecret: (serviceId) => get().secrets[serviceId],

      clearSecret: (serviceId) =>
        set((state) => {
          const updated = { ...state.secrets };
          delete updated[serviceId];
          return { secrets: updated };
        }),

      clearAll: () => set({ secrets: {} }),
    }),
    {
      name: "registry-secrets",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? encryptedSessionStorage
          : {
              getItem: async () => null,
              setItem: async () => {},
              removeItem: async () => {},
            },
      ),
    },
  ),
);
