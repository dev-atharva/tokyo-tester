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
      entity_id: "workflow-2",
      change_type: "update",
      data: { id: "workflow-2", version: 4 },
    });
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-3",
      change_type: "delete",
      data: { id: "workflow-3", version: 5 },
    });
    expect(
      service
        .getDebugInfo()
        .queueSnapshot.map((change) => change.client_version),
    ).toEqual([0, 3, 4]);
  });

  test("keeps create-then-update entities as inserts with the latest data", () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    const service = new SyncService();

    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "insert",
      data: { id: "workflow-1", version: 1, name: "Draft" },
    });
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "update",
      data: { id: "workflow-1", version: 2, name: "Imported workflow" },
    });

    expect(service.getDebugInfo().queueSnapshot).toEqual([
      expect.objectContaining({
        entity_type: "workflow",
        entity_id: "workflow-1",
        change_type: "insert",
        client_version: 0,
        data: expect.objectContaining({
          name: "Imported workflow",
          version: 2,
        }),
      }),
    ]);
  });

  test("repairs persisted missing workflow updates by retrying them as inserts", async () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    const requestChangeTypes: string[] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body)) as {
        changes: Array<{ change_type: string }>;
      };
      requestChangeTypes.push(body.changes[0]?.change_type ?? "missing");

      if (requestChangeTypes.length === 1) {
        return new Response(
          JSON.stringify({
            success: false,
            processed_count: 0,
            errors: [
              {
                entity_type: "workflow",
                entity_id: "workflow-1",
                message: "workflow workflow-1 no longer exists",
              },
            ],
            server_version: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          processed_count: body.changes.length,
          errors: [],
          server_version: 2,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const service = new SyncService();
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "update",
      data: { id: "workflow-1", version: 2, is_deleted: false },
    });

    await service.flushPendingBeforeRun();

    expect(requestChangeTypes).toEqual(["update", "insert"]);
    expect(service.getQueueSize()).toBe(0);
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

  test("pre-run flush ignores pending run history while syncing workflow definitions", async () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    const requestEntityTypes: string[][] = [];
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const body = JSON.parse(String(init?.body)) as {
        changes: Array<{ entity_type: string }>;
      };
      requestEntityTypes.push(body.changes.map((change) => change.entity_type));
      return new Response(
        JSON.stringify({
          success: true,
          processed_count: body.changes.length,
          errors: [],
          server_version: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const service = new SyncService();
    service.queueChange({
      entity_type: "workflow_run",
      entity_id: "workflow-run-1",
      change_type: "insert",
      data: { id: "workflow-run-1", version: 1 },
    });
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-1",
      change_type: "update",
      data: { id: "workflow-1", version: 2 },
    });
    service.queueChange({
      entity_type: "scenario_run",
      entity_id: "scenario-run-1",
      change_type: "insert",
      data: { id: "scenario-run-1", version: 1 },
    });

    await service.flushPendingBeforeRun();

    expect(requestEntityTypes).toEqual([["workflow"]]);
    expect(service.hasPendingPreRunChanges()).toBe(false);
    expect(
      service.getDebugInfo().queueSnapshot.map((change) => change.entity_type),
    ).toEqual(["workflow_run", "scenario_run"]);
  });

  test("only unsynced workflow creates or deletes block a run after pre-run sync fails", async () => {
    setCurrentSessionUserId("user-1");
    setCurrentSessionProjectId("project-1");
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          success: false,
          processed_count: 0,
          errors: [{ message: "sync temporarily unavailable" }],
          server_version: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof fetch;

    const service = new SyncService();
    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-existing",
      change_type: "update",
      data: { id: "workflow-existing", version: 2 },
    });
    await service.flushPendingBeforeRun();

    expect(service.hasPendingPreRunChanges()).toBe(true);
    expect(service.hasBlockingPreRunChanges("workflow-existing")).toBe(false);

    service.queueChange({
      entity_type: "workflow",
      entity_id: "workflow-new",
      change_type: "insert",
      data: { id: "workflow-new", version: 1 },
    });

    expect(service.hasBlockingPreRunChanges("workflow-new")).toBe(true);
  });
});
