import { beforeEach, describe, expect, test } from "bun:test";
import { useRegistrySecretStore } from "./registry-secret-store";

describe("registry secret store", () => {
  beforeEach(() => useRegistrySecretStore.getState().clearAll());

  test("scopes credentials by workflow and stable node id", () => {
    const secret = {
      url: "ghcr.io",
      auth_type: "basic" as const,
      username: "robot",
      password: "pull-token",
    };
    useRegistrySecretStore.getState().setSecret("workflow-a", "node-a", secret);

    expect(
      useRegistrySecretStore.getState().getSecret("workflow-a", "node-a"),
    ).toEqual(secret);
    expect(
      useRegistrySecretStore.getState().getSecret("workflow-b", "node-a"),
    ).toBeUndefined();
    expect(
      useRegistrySecretStore.getState().getSecret("workflow-a", "node-b"),
    ).toBeUndefined();
  });

  test("clears one workflow without affecting another", () => {
    const publicRegistry = {
      url: "registry.example.com",
      auth_type: "none" as const,
    };
    const store = useRegistrySecretStore.getState();
    store.setSecret("workflow-a", "node-a", publicRegistry);
    store.setSecret("workflow-b", "node-a", publicRegistry);
    store.clearWorkflow("workflow-a");

    expect(store.getSecret("workflow-a", "node-a")).toBeUndefined();
    expect(store.getSecret("workflow-b", "node-a")).toEqual(publicRegistry);
  });
});
