import { beforeEach, describe, expect, test } from "bun:test";
import { useRunSecretStore } from "./run-secret-store";

describe("run-secret session vault", () => {
  const first = { userId: "user-a", projectId: "project-a", workflowId: "one" };

  beforeEach(() => useRunSecretStore.getState().clearAll());

  test("isolates values by user, project, workflow, and reference", () => {
    const store = useRunSecretStore.getState();
    store.setSecret(first, "PASSWORD", "first");
    store.setSecret({ ...first, userId: "user-b" }, "PASSWORD", "other-user");
    store.setSecret(
      { ...first, projectId: "project-b" },
      "PASSWORD",
      "other-project",
    );
    store.setSecret(
      { ...first, workflowId: "two" },
      "PASSWORD",
      "other-workflow",
    );
    store.setSecret(first, "TOKEN", "other-reference");

    expect(useRunSecretStore.getState().getSecret(first, "PASSWORD")).toBe(
      "first",
    );
    expect(
      useRunSecretStore
        .getState()
        .getSecret({ ...first, userId: "user-b" }, "PASSWORD"),
    ).toBe("other-user");
    expect(useRunSecretStore.getState().getSecret(first, "TOKEN")).toBe(
      "other-reference",
    );
  });

  test("supports replacement, explicit clear, workflow removal, and logout clear", () => {
    const store = useRunSecretStore.getState();
    store.setSecret(first, "PASSWORD", "old");
    store.setSecret(first, "PASSWORD", "new");
    expect(useRunSecretStore.getState().getSecret(first, "PASSWORD")).toBe(
      "new",
    );
    useRunSecretStore.getState().clearSecret(first, "PASSWORD");
    expect(
      useRunSecretStore.getState().getSecret(first, "PASSWORD"),
    ).toBeUndefined();

    store.setSecret(first, "PASSWORD", "one");
    store.setSecret({ ...first, workflowId: "two" }, "PASSWORD", "two");
    useRunSecretStore.getState().clearWorkflow("one");
    expect(
      useRunSecretStore.getState().getSecret(first, "PASSWORD"),
    ).toBeUndefined();
    expect(
      useRunSecretStore
        .getState()
        .getSecret({ ...first, workflowId: "two" }, "PASSWORD"),
    ).toBe("two");
    useRunSecretStore.getState().clearAll();
    expect(useRunSecretStore.getState().values).toEqual({});
  });
});
