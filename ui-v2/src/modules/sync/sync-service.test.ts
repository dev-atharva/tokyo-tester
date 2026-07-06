import { afterEach, describe, expect, test } from "bun:test";
import { setCurrentSessionUserId } from "@/modules/auth/session-user";
import { setCurrentSessionProjectId } from "@/modules/projects/session-project";
import { SyncService } from "./sync-service";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setCurrentSessionUserId(null);
  setCurrentSessionProjectId(null);
});

describe("sync service", () => {
  test("uses the serialized entity version as the optimistic concurrency base", () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    const service = new SyncService();
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "insert",
      data: { id: "workflow-1", version: 1 },
    });
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "update",
      data: { id: "workflow-1", version: 4 },
    });
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "delete",
      data: { id: "workflow-1", version: 5 },
    });
    expect(
      service
        .getDebugInfo()
        .queueSnapshot.map((change) => change.client_version),
    ).toEqual([0, 3, 4]);
  });

  test("flushPending includes changes queued by store microtasks", async () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    let requests = 0;
    globalThis.fetch = (async () => {
      requests += 1;
      return new Response(
        JSON.stringify({
          success: true,
          processed_count: 1,
          errors: [],
          server_version: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const service = new SyncService();
    queueMicrotask(() => {
      service.queueChange({
        entity_type: "workflow_run",
        entity_id: "workflow-run-1",
        change_type: "insert",
        data: { id: "workflow-run-1" },
      });
    });

    await service.flushPending();

    expect(requests).toBe(1);
    expect(service.getQueueSize()).toBe(0);
  });

  test("retains a batch when the server reports a transactional rollback", async () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          processed_count: 0,
          errors: [{ message: "database write failed" }],
          server_version: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const service = new SyncService();
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "update",
      data: { id: "workflow-1" },
    });

    expect(await service.flush()).toBeNull();
    expect(service.getQueueSize()).toBe(1);
  });
});
