"use client";

import { del } from "idb-keyval";
import { setCurrentSessionProjectId } from "../projects/session-project";
import { syncService } from "../sync/sync-service";
import { useRegistrySecretStore } from "../workflow/stores/registry-secret-store";
import { useRunSecretStore } from "../workflow/stores/run-secret-store";
import { setCurrentSessionUserId } from "./session-user";

const PERSISTED_KEYS = [
  "workflow-store",
  "scenario-store",
  "execution-store",
  "scenario-run-store",
  "test-result-store",
];

const PROJECT_STATE_KEY_PREFIX = "cots_active_project";

export async function clearProjectScopedClientState() {
  await syncService.flushPending().catch((error) => {
    console.error(
      "[SyncService] Failed to flush before clearing project state:",
      error,
    );
  });
  syncService.clearQueue();
  setCurrentSessionProjectId(null);
  useRegistrySecretStore.getState().clearAll();
  useRunSecretStore.getState().clearAll();
  await Promise.all(PERSISTED_KEYS.map((key) => del(key)));
}

export async function clearUserScopedClientState() {
  await syncService.flushPending().catch((error) => {
    console.error("[SyncService] Failed to flush before logout:", error);
  });
  syncService.stop();
  syncService.setEnabled(false);
  syncService.clearQueue();
  setCurrentSessionUserId(null);
  setCurrentSessionProjectId(null);
  useRegistrySecretStore.getState().clearAll();
  useRunSecretStore.getState().clearAll();

  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("cots_user_id");
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PROJECT_STATE_KEY_PREFIX))
    .forEach((key) => {
      localStorage.removeItem(key);
    });

  await Promise.all(PERSISTED_KEYS.map((key) => del(key)));
}
