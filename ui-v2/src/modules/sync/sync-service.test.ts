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
