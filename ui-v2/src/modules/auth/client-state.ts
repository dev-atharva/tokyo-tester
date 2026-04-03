"use client";

import { del } from "idb-keyval";
import { setCurrentSessionUserId } from "./session-user";

const PERSISTED_KEYS = [
  "workflow-store",
  "scenario-store",
  "execution-store",
  "scenario-run-store",
  "test-result-store",
];

export async function clearUserScopedClientState() {
  setCurrentSessionUserId(null);

  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("cots_user_id");

  await Promise.all(PERSISTED_KEYS.map((key) => del(key)));
  sessionStorage.removeItem("registry-secrets");
}
