"use client";

import { del } from "idb-keyval";
import { setCurrentSessionUserId } from "./session-user";
import { setCurrentSessionProjectId } from "../projects/session-project";
import { syncService } from "../sync/sync-service";

const PERSISTED_KEYS = [
  "workflow-store",
  "scenario-store",
  "execution-store",
  "scenario-run-store",
  "test-result-store",
];

const PROJECT_STATE_KEY_PREFIX = "cots_active_project";

export async function clearProjectScopedClientState() {
  syncService.clearQueue();
  setCurrentSessionProjectId(null);
  await Promise.all(PERSISTED_KEYS.map((key) => del(key)));
  sessionStorage.removeItem("registry-secrets");
}

export async function clearUserScopedClientState() {
  setCurrentSessionUserId(null);
  setCurrentSessionProjectId(null);

  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("cots_user_id");
  Object.keys(localStorage)
    .filter((key) => key.startsWith(PROJECT_STATE_KEY_PREFIX))
    .forEach((key) => localStorage.removeItem(key));

  await Promise.all(PERSISTED_KEYS.map((key) => del(key)));
  sessionStorage.removeItem("registry-secrets");
}
