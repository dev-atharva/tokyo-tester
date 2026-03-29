import { getOrCreateClientId, getUserId } from "./client-id";
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

export class SyncService {
  private _baseUrl: string;
  private syncQueue: FastQueue<SyncChange>;
  private _syncInterval: number = 3000;
  private _maxBatchSize: number = 100;
  private intervalId: NodeJS.Timeout | null = null;
  private enabled: boolean = true;
  private flushCount: number = 0;

  constructor(baseUrl: string = "http://localhost:8080") {
    this._baseUrl = baseUrl;
    this.syncQueue = new FastQueue<SyncChange>(1024);
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
    console.log(
      `[SyncService] Queued: ${change.entity_type}/${change.entity_id} (${change.change_type}) - Queue: ${this.syncQueue.getSize()}`,
    );
  }

  async flush(): Promise<SyncBatchResponse | null> {
    if (!this.enabled || this.syncQueue.isEmpty()) {
      return null;
    }

    const batch = this.syncQueue.dequeueMany(this._maxBatchSize);
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

      return response;
    } catch (error) {
      console.error("[SyncService] Failed:", error);
      this.syncQueue.unshiftMany(batch);
      console.log(`[SyncService] Re-queued ${batch.length} failed items`);
      return null;
    }
  }

  private async sendBatch(changes: SyncChange[]): Promise<SyncBatchResponse> {
    const userId = getUserId();
    const clientId = getOrCreateClientId();

    const request: SyncBatchRequest = {
      user_id: userId,
      client_id: clientId,
      timestamp: new Date().toISOString(),
      changes,
    };

    const url = `${this._baseUrl}/api/v1/sync/batch`;

    console.log(
      `[SyncService] Sending batch for user: ${userId}, client: ${clientId}`,
    );

    const response = await fetch(url, {
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
    const response = await fetch(`${this._baseUrl}/api/v1/sync/status`);
    if (!response.ok) {
      throw new Error(`Status check failed: ${response.status}`);
    }
    return response.json();
  }

  async pull(): Promise<SyncPullResponse> {
    const userId = getUserId();
    const clientId = getOrCreateClientId();

    const url = `${this._baseUrl}/api/v1/sync/pull/${clientId}?userId=${userId}`;
    console.log(
      `[SyncService] Pulling data for user: ${userId}, client: ${clientId}`,
    );

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Pull failed: ${response.status}`);
    }
    return response.json();
  }

  async clear(): Promise<void> {
    const userId = getUserId();
    const clientId = getOrCreateClientId();

    const url = `${this._baseUrl}/api/v1/sync/clear/${clientId}?userId=${userId}`;

    const response = await fetch(url, { method: "DELETE" });
    if (!response.ok) {
      throw new Error(`Clear failed: ${response.status}`);
    }
  }

  getQueueSize(): number {
    return this.syncQueue.getSize();
  }

  clearQueue(): void {
    this.syncQueue.clear();
    console.log("[SyncService] Queue cleared");
  }

  getDebugInfo() {
    return {
      baseUrl: this._baseUrl,
      userId: getUserId(),
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
}

export const syncService = new SyncService();

if (typeof window !== "undefined") {
  window.syncService = syncService;
}
