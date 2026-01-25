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
    baseUrl = "http://localhost:8080",
    syncInterval = 3000,
    maxBatchSize = 100,
    enabled = true,
    autoStart = true,
  } = config;

  // Access private properties properly via type casting
  if (baseUrl !== (syncService as any).baseUrl) {
    (syncService as any).baseUrl = baseUrl;
  }

  if (syncInterval !== (syncService as any).syncInterval) {
    (syncService as any).syncInterval = syncInterval;
  }

  if (maxBatchSize !== (syncService as any).maxBatchSize) {
    (syncService as any).maxBatchSize = maxBatchSize;
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
  status: string;
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
