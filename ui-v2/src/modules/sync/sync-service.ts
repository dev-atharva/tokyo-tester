import { getOrCreateClientId, getProjectId, getUserId } from "./client-id";
import { FastQueue } from "./fast-queue";
import type {
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

    const fullChange: SyncChange = {
      ...change,
      client_time: new Date().toISOString(),
      client_version: 1,
    };

    this.syncQueue.enqueue(fullChange);
    this.persistQueue();
    console.log(
      `[SyncService] Queued: ${change.entity_type}/${change.entity_id} (${change.change_type}) - Queue: ${this.syncQueue.getSize()}`,
    );
  }

  async flush(): Promise<SyncBatchResponse | null> {
    if (!this.enabled || this.syncQueue.isEmpty()) {
      return null;
    }

    const batch = this.syncQueue.dequeueMany(this._maxBatchSize);
    this.persistQueue();
    if (batch.length === 0) return null;

    console.log(`[SyncService] Flushing ${batch.length} changes...`);

    try {
      const response = await this.sendBatch(batch);
      console.log(
        `[SyncService] ✅ Synced ${response.processed_count}/${batch.length}`,
      );

      if (response.conflicts && response.conflicts.length > 0) {
        console.warn("[SyncService] Conflicts:", response.conflicts);
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

      return response;
    } catch (error) {
      console.error("[SyncService] Failed:", error);
      this.syncQueue.unshiftMany(batch);
      this.persistQueue();
      console.log(`[SyncService] Re-queued ${batch.length} failed items`);
      return null;
    }
  }

  async flushPending(maxAttempts: number = 10): Promise<void> {
    let attempts = 0;

    while (!this.syncQueue.isEmpty() && attempts < maxAttempts) {
      attempts += 1;
      const result = await this.flush();
      if (result === null) {
        break;
      }
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
      changes,
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

function getCurrentProjectIdSafe() {
  try {
    return getProjectId();
  } catch {
    return null;
  }
}

export const syncService = new SyncService();

if (typeof window !== "undefined") {
  window.syncService = syncService;
}
