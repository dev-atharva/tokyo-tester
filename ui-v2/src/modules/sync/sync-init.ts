import { syncService } from "./sync-service";

export interface SyncConfig {
  baseUrl?: string;
  syncInterval?: number;
  maxBatchSize?: number;
  enabled?: boolean;
  autoStart?: boolean;
}

export function initSync(config: SyncConfig = {}): void {
  const {
    baseUrl = "",
    syncInterval = 3000,
    maxBatchSize = 100,
    enabled = true,
    autoStart = true,
  } = config;

  if (baseUrl !== syncService.baseUrl) {
    syncService.baseUrl = baseUrl;
  }

  if (syncInterval !== syncService.syncInterval) {
    syncService.syncInterval = syncInterval;
  }

  if (maxBatchSize !== syncService.maxBatchSize) {
    syncService.maxBatchSize = maxBatchSize;
  }

  syncService.setEnabled(enabled);

  if (autoStart && enabled) {
    syncService.start();
    console.log("[Sync] Initialized and started");
  } else {
    console.log("[Sync] Initialized (not started)");
  }
}

export function stopSync(): void {
  syncService.stop();
  console.log("[Sync] Stopped");
}

export async function syncNow(): Promise<void> {
  await syncService.flush();
}

export async function checkSyncHealth(): Promise<{
  status: "healthy" | "degraded" | "down" | "error";
  queueSize: number;
}> {
  try {
    const serverStatus = await syncService.getStatus();
    return {
      status: serverStatus.status,
      queueSize: syncService.getQueueSize(),
    };
  } catch (error) {
    console.error("[Sync] Health check failed:", error);
    return {
      status: "error",
      queueSize: syncService.getQueueSize(),
    };
  }
}
