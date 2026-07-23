import { getOrCreateClientId, getProjectId, getUserId } from "./client-id";
import { FastQueue } from "./fast-queue";
import type {
  EntityType,
  SyncBatchRequest,
  SyncBatchResponse,
  SyncChange,
  SyncPullResponse,
  SyncStatusResponse,
} from "./sync-types";

declare global {
  interface Window {
    syncService?: SyncService;
  }
}

const PERSISTED_SYNC_QUEUE_KEY = "cots_sync_queue";
const DEFAULT_SYNC_BASE_URL = "";
const PRE_RUN_SYNC_ENTITIES = new Set<EntityType>(["workflow", "scenario"]);

export class SyncService {
  private _baseUrl: string;
  private syncQueue: FastQueue<SyncChange>;
  private _syncInterval: number = 3000;
  private _maxBatchSize: number = 100;
  private _requestTimeoutMs: number = 8000;
  private intervalId: NodeJS.Timeout | null = null;
  private enabled: boolean = true;
  private flushCount: number = 0;

  constructor(baseUrl: string = DEFAULT_SYNC_BASE_URL) {
    this._baseUrl = baseUrl;
    this.syncQueue = new FastQueue<SyncChange>(1024);
    this.restoreQueue();
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  set baseUrl(url: string) {
    this._baseUrl = url;
  }

  get syncInterval(): number {
    return this._syncInterval;
  }

  set syncInterval(interval: number) {
    this._syncInterval = interval;
    if (this.intervalId) {
      this.stop();
      this.start();
    }
  }

  get maxBatchSize(): number {
    return this._maxBatchSize;
  }

  set maxBatchSize(size: number) {
    this._maxBatchSize = size;
  }

  private async fetchWithTimeout(
    input: string,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this._requestTimeoutMs,
    );

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  start(): void {
    if (this.intervalId) return;

    this.intervalId = setInterval(() => {
      this.flushCount++;
      this.flush();
    }, this._syncInterval);

    console.log(`[SyncService] Started (interval: ${this._syncInterval}ms)`);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("[SyncService] Stopped");
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    console.log(`[SyncService] ${enabled ? "Enabled" : "Disabled"}`);
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  queueChange(
    change: Omit<SyncChange, "client_time" | "client_version">,
  ): void {
    if (!this.enabled) return;

    const serializedVersion = Number(
      (change.data as { version?: number } | null)?.version ?? 0,
    );
    const fullChange: SyncChange = {
      ...change,
      client_time: new Date().toISOString(),
      client_version:
        change.change_type === "insert"
          ? 0
          : Math.max(0, serializedVersion - 1),
    };

    if (this.coalesceQueuedChange(fullChange)) {
      console.log(
        `[SyncService] Coalesced: ${change.entity_type}/${change.entity_id} (${change.change_type}) - Queue: ${this.syncQueue.getSize()}`,
      );
      return;
    }

    this.syncQueue.enqueue(fullChange);
    this.persistQueue();
    console.log(
      `[SyncService] Queued: ${change.entity_type}/${change.entity_id} (${change.change_type}) - Queue: ${this.syncQueue.getSize()}`,
    );
  }

  private coalesceQueuedChange(incoming: SyncChange): boolean {
    const current = this.syncQueue.toArray();
    const index = current.findIndex(
      (change) =>
        change.entity_type === incoming.entity_type &&
        change.entity_id === incoming.entity_id,
    );
    if (index === -1) {
      return false;
    }

    const existing = current[index];
    if (
      existing.change_type === "insert" &&
      incoming.change_type === "update"
    ) {
      current[index] = {
        ...incoming,
        change_type: "insert",
        client_version: 0,
      };
      this.replaceQueue(current);
      this.persistQueue();
      return true;
    }

    return false;
  }

  async flush(): Promise<SyncBatchResponse | null> {
    if (!this.enabled || this.syncQueue.isEmpty()) {
      return null;
    }

    const batch = this.syncQueue.dequeueMany(this._maxBatchSize);
    this.persistQueue();
    if (batch.length === 0) return null;

    return this.commitBatch(batch);
  }

  private async commitBatch(
    batch: SyncChange[],
  ): Promise<SyncBatchResponse | null> {
    console.log(`[SyncService] Flushing ${batch.length} changes...`);

    try {
      const response = await this.sendBatch(batch);
      console.log(
        `[SyncService] ✅ Synced ${response.processed_count}/${batch.length}`,
      );

      const repairedBatch = this.repairMissingEntityUpdates(
        batch,
        response.errors,
      );
      if (repairedBatch) {
        console.warn(
          "[SyncService] Retrying missing local entities as inserts",
        );
        const retryResponse = await this.sendBatch(repairedBatch);
        console.log(
          `[SyncService] ✅ Synced ${retryResponse.processed_count}/${repairedBatch.length} repaired changes`,
        );
        if (retryResponse.errors && retryResponse.errors.length > 0) {
          console.warn(
            "[SyncService] Sync completed with server-reported errors:",
            retryResponse.errors,
          );
        }
        if (!retryResponse.success || (retryResponse.errors?.length ?? 0) > 0) {
          this.syncQueue.unshiftMany(repairedBatch);
          this.persistQueue();
          console.warn(
            `[SyncService] Re-queued ${repairedBatch.length} repaired changes because the server rolled back the batch`,
          );
          return null;
        }
        this.dispatchConflicts(retryResponse, repairedBatch);
        return retryResponse;
      }

      if (response.errors && response.errors.length > 0) {
        console.warn(
          "[SyncService] Sync completed with server-reported errors:",
          response.errors,
        );
      }

      if (!response.success || (response.errors?.length ?? 0) > 0) {
        this.syncQueue.unshiftMany(batch);
        this.persistQueue();
        console.warn(
          `[SyncService] Re-queued ${batch.length} changes because the server rolled back the batch`,
        );
        return null;
      }

      this.dispatchConflicts(response, batch);
      return response;
    } catch (error) {
      console.error("[SyncService] Failed:", error);
      this.syncQueue.unshiftMany(batch);
      this.persistQueue();
      console.log(`[SyncService] Re-queued ${batch.length} failed items`);
      return null;
    }
  }

  private dispatchConflicts(
    response: SyncBatchResponse,
    batch: SyncChange[],
  ): void {
    if (!response.conflicts || response.conflicts.length === 0) {
      return;
    }

    console.warn("[SyncService] Conflicts:", response.conflicts);
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("tokyo:sync-conflict", {
        detail: response.conflicts.map((conflict) => ({
          ...conflict,
          local_data: batch.find(
            (change) =>
              change.entity_type === conflict.entity_type &&
              change.entity_id === conflict.entity_id,
          )?.data,
        })),
      }),
    );
  }

  private repairMissingEntityUpdates(
    batch: SyncChange[],
    errors: SyncBatchResponse["errors"],
  ): SyncChange[] | null {
    if (!errors?.length) {
      return null;
    }

    const missingUpdates = new Set(
      errors
        .filter(
          (error) =>
            (error.entity_type === "workflow" ||
              error.entity_type === "scenario") &&
            Boolean(error.entity_id) &&
            error.message.includes("no longer exists"),
        )
        .map((error) => `${error.entity_type}:${error.entity_id}`),
    );
    if (missingUpdates.size === 0) {
      return null;
    }

    let repaired = false;
    const repairedBatch = batch.map((change) => {
      if (
        change.change_type !== "update" ||
        !missingUpdates.has(`${change.entity_type}:${change.entity_id}`) ||
        isDeletedPayload(change.data)
      ) {
        return change;
      }
      repaired = true;
      return {
        ...change,
        change_type: "insert" as const,
        client_version: 0,
      };
    });

    return repaired ? repairedBatch : null;
  }

  async flushPending(maxAttempts: number = 10): Promise<void> {
    // Zustand sync middleware enqueues changes in a microtask after updating its
    // store. Let those changes reach this queue before deciding there is
    // nothing to flush (notably when a workflow run has just been created).
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    let attempts = 0;

    while (!this.syncQueue.isEmpty() && attempts < maxAttempts) {
      attempts += 1;
      const result = await this.flush();
      if (result === null) {
        break;
      }
    }
  }

  async flushPendingBeforeRun(maxAttempts: number = 10): Promise<void> {
    await new Promise<void>((resolve) => queueMicrotask(resolve));

    let attempts = 0;
    while (this.hasPendingPreRunChanges() && attempts < maxAttempts) {
      attempts += 1;
      const batch = this.dequeueMatching((change) =>
        PRE_RUN_SYNC_ENTITIES.has(change.entity_type),
      );
      if (batch.length === 0) return;

      const result = await this.commitBatch(batch);
      if (result === null) return;
    }
  }

  hasPendingPreRunChanges(): boolean {
    return this.syncQueue
      .toArray()
      .some((change) => PRE_RUN_SYNC_ENTITIES.has(change.entity_type));
  }

  hasBlockingPreRunChanges(workflowId: string): boolean {
    return this.syncQueue.toArray().some((change) => {
      if (
        change.entity_type !== "workflow" ||
        change.entity_id !== workflowId
      ) {
        return false;
      }
      return change.change_type === "insert" || change.change_type === "delete";
    });
  }

  getPendingPreRunChanges(): SyncChange[] {
    return this.syncQueue
      .toArray()
      .filter((change) => PRE_RUN_SYNC_ENTITIES.has(change.entity_type));
  }

  private dequeueMatching(
    predicate: (change: SyncChange) => boolean,
  ): SyncChange[] {
    const current = this.syncQueue.toArray();
    const batch: SyncChange[] = [];
    const remaining: SyncChange[] = [];

    for (const change of current) {
      if (predicate(change) && batch.length < this._maxBatchSize) {
        batch.push(change);
      } else {
        remaining.push(change);
      }
    }

    this.replaceQueue(remaining);
    this.persistQueue();

    return batch;
  }

  private replaceQueue(changes: SyncChange[]): void {
    this.syncQueue.clear();
    for (const change of changes) {
      this.syncQueue.enqueue(change);
    }
  }

  flushOnPageHide(): boolean {
    if (
      !this.enabled ||
      this.syncQueue.isEmpty() ||
      typeof window === "undefined" ||
      typeof navigator === "undefined" ||
      typeof navigator.sendBeacon !== "function"
    ) {
      return false;
    }

    const batch = this.syncQueue.dequeueMany(this._maxBatchSize);
    this.persistQueue();
    if (batch.length === 0) {
      return false;
    }

    const userId = getUserId();
    const projectId = getProjectId();
    const clientId = getOrCreateClientId();
    const request: SyncBatchRequest = {
      user_id: userId,
      project_id: projectId,
      client_id: clientId,
      timestamp: new Date().toISOString(),
      changes: batch,
    };

    const payload = JSON.stringify(request);
    const blob = new Blob([payload], { type: "application/json" });
    const success = navigator.sendBeacon(
      `${this._baseUrl}/api/v1/sync/batch`,
      blob,
    );

    if (success) {
      console.log(`[SyncService] Beacon-flushed ${batch.length} changes`);
      return true;
    }

    this.syncQueue.unshiftMany(batch);
    this.persistQueue();
    return false;
  }

  private async sendBatch(changes: SyncChange[]): Promise<SyncBatchResponse> {
    const userId = getUserId();
    const projectId = getProjectId();
    const clientId = getOrCreateClientId();

    const request: SyncBatchRequest = {
      user_id: userId,
      project_id: projectId,
      client_id: clientId,
      timestamp: new Date().toISOString(),
      changes: orderSyncChanges(changes),
    };

    const url = `${this._baseUrl}/api/v1/sync/batch`;

    console.log(
      `[SyncService] Sending batch for user: ${userId}, project: ${projectId}, client: ${clientId}`,
    );

    const response = await this.fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status}: ${errorText}`);
    }

    return response.json();
  }

  async getStatus(): Promise<SyncStatusResponse> {
    const response = await this.fetchWithTimeout(
      `${this._baseUrl}/api/v1/sync/status`,
    );
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    return response.json();
  }

  async pull(): Promise<SyncPullResponse> {
    const userId = getUserId();
    const projectId = getProjectId();
    const clientId = getOrCreateClientId();

    const url = `${this._baseUrl}/api/v1/sync/pull/${clientId}?userId=${userId}&projectId=${projectId}`;
    console.log(
      `[SyncService] Pulling data for user: ${userId}, project: ${projectId}, client: ${clientId}`,
    );

    const response = await this.fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`Pull failed: ${response.status}`);
    }
    return response.json();
  }

  async clear(): Promise<void> {
    const userId = getUserId();
    const projectId = getProjectId();
    const clientId = getOrCreateClientId();

    const url = `${this._baseUrl}/api/v1/sync/clear/${clientId}?userId=${userId}&projectId=${projectId}`;

    const response = await this.fetchWithTimeout(url, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Clear failed: ${response.status}`);
    }
  }

  getQueueSize(): number {
    return this.syncQueue.getSize();
  }

  clearQueue(): void {
    this.syncQueue.clear();
    this.persistQueue();
    console.log("[SyncService] Queue cleared");
  }

  getDebugInfo() {
    return {
      baseUrl: this._baseUrl,
      userId: getUserId(),
      projectId: getCurrentProjectIdSafe(),
      clientId: getOrCreateClientId(),
      syncInterval: this._syncInterval,
      maxBatchSize: this._maxBatchSize,
      enabled: this.enabled,
      isRunning: this.isRunning(),
      queueSize: this.syncQueue.getSize(),
      flushCount: this.flushCount,
      queueSnapshot: this.syncQueue.toArray().slice(0, 10),
    };
  }

  private restoreQueue(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const raw = window.localStorage.getItem(PERSISTED_SYNC_QUEUE_KEY);
      if (!raw) {
        return;
      }

      const items = JSON.parse(raw) as SyncChange[];
      for (const item of items) {
        this.syncQueue.enqueue(item);
      }

      console.log(`[SyncService] Restored ${items.length} queued changes`);
    } catch (error) {
      console.error("[SyncService] Failed to restore persisted queue:", error);
      window.localStorage.removeItem(PERSISTED_SYNC_QUEUE_KEY);
    }
  }

  private persistQueue(): void {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const items = this.syncQueue.toArray();
      if (items.length === 0) {
        window.localStorage.removeItem(PERSISTED_SYNC_QUEUE_KEY);
        return;
      }

      window.localStorage.setItem(
        PERSISTED_SYNC_QUEUE_KEY,
        JSON.stringify(items),
      );
    } catch (error) {
      console.error("[SyncService] Failed to persist queue:", error);
    }
  }
}

const SYNC_ENTITY_ORDER: Record<EntityType, number> = {
  workflow: 0,
  scenario: 1,
  workflow_run: 2,
  scenario_run: 3,
  test_result: 4,
};

function orderSyncChanges(changes: SyncChange[]): SyncChange[] {
  return changes
    .map((change, index) => ({ change, index }))
    .sort(
      (left, right) =>
        SYNC_ENTITY_ORDER[left.change.entity_type] -
          SYNC_ENTITY_ORDER[right.change.entity_type] ||
        left.index - right.index,
    )
    .map(({ change }) => change);
}

function getCurrentProjectIdSafe() {
  try {
    return getProjectId();
  } catch {
    return null;
  }
}

function isDeletedPayload(data: SyncChange["data"]): boolean {
  return Boolean(
    data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      "is_deleted" in data &&
      data.is_deleted === true,
  );
}

export const syncService = new SyncService();

if (typeof window !== "undefined") {
  window.syncService = syncService;
}
