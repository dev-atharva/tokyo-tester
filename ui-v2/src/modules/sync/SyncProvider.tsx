"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { initializeSyncWithHydration } from "./sync-hydration";
import {
  checkSyncHealth,
  initSync,
  type SyncConfig,
  syncNow,
} from "./sync-init";

interface SyncContextValue {
  isInitialized: boolean;
  syncStatus: "healthy" | "degraded" | "down" | "error" | "unknown";
  queueSize: number;
  forceSync: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  rehydrate: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export interface SyncProviderProps {
  children: ReactNode;
  config?: SyncConfig;
  statusPollingInterval?: number;
}

export function SyncProvider({
  children,
  config = {},
  statusPollingInterval = 10000,
}: SyncProviderProps) {
  const [isInitialized, setInitialized] = useState(false);
  const [isHydrating, setIsHydrating] = useState(true);
  const [syncStatus, setSyncStatus] = useState<
    "healthy" | "degraded" | "down" | "error" | "unknown"
  >("unknown");
  const [queueSize, setQueueSize] = useState(0);

  const checkHealth = useCallback(async () => {
    try {
      const health = await checkSyncHealth();
      setSyncStatus(health.status);
      setQueueSize(health.queueSize);
    } catch (error) {
      console.error("[SyncService] Health check failed:", error);
      setSyncStatus("error");
    }
  }, []);

  useEffect(() => {
    const initialize = async () => {
      try {
        // Initialize sync config
        initSync({
          baseUrl: config.baseUrl || "http://localhost:8080",
          syncInterval: config.syncInterval || 3000,
          maxBatchSize: config.maxBatchSize || 100,
          enabled: config.enabled !== false,
          autoStart: false,
        });

        // Hydrate from server if needed
        await initializeSyncWithHydration();

        setInitialized(true);
        setIsHydrating(false);
        await checkHealth();
      } catch (error) {
        console.error("[SyncProvider] Initialization failed:", error);
        setInitialized(false);
        setIsHydrating(false);
      }
    };

    initialize();
  }, [
    checkHealth,
    config.baseUrl,
    config.enabled,
    config.maxBatchSize,
    config.syncInterval,
  ]);

  useEffect(() => {
    if (!isInitialized || statusPollingInterval <= 0) return;

    const interval = setInterval(() => {
      checkHealth();
    }, statusPollingInterval);

    return () => clearInterval(interval);
  }, [isInitialized, statusPollingInterval, checkHealth]);

  const forceSync = async () => {
    try {
      await syncNow();
      await checkHealth();
    } catch (error) {
      console.error("[SyncProvider] Force sync failed:", error);
    }
  };

  const refreshStatus = async () => {
    await checkHealth();
  };

  const rehydrate = async () => {
    try {
      setIsHydrating(true);
      const { hydrateFromServer } = await import("./sync-hydration");
      await hydrateFromServer();
      await checkHealth();
    } catch (error) {
      console.error("[SyncProvider] Re-hydration failed:", error);
    } finally {
      setIsHydrating(false);
    }
  };

  const contextValue: SyncContextValue = {
    isInitialized,
    syncStatus,
    queueSize,
    forceSync,
    refreshStatus,
    rehydrate,
  };

  return (
    <SyncContext.Provider value={contextValue}>
      {isHydrating ? (
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Loading data from server...
            </p>
          </div>
        </div>
      ) : (
        children
      )}
    </SyncContext.Provider>
  );
}

export function useSyncContext(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error("useSyncContext must be used within SyncProvider");
  }
  return context;
}

export function SyncStatusIndicator() {
  const { syncStatus, queueSize, forceSync } = useSyncContext();

  const getStatusColor = () => {
    switch (syncStatus) {
      case "healthy":
        return "bg-green-500";
      case "degraded":
        return "bg-amber-500";
      case "down":
      case "error":
        return "bg-red-500";
      default:
        return "bg-slate-400";
    }
  };

  const getStatusTextColor = () => {
    switch (syncStatus) {
      case "healthy":
        return "text-green-700";
      case "degraded":
        return "text-amber-700";
      case "down":
      case "error":
        return "text-red-700";
      default:
        return "text-slate-600";
    }
  };

  return (
    <div className="flex items-center gap-2 p-2 border rounded-lg bg-white">
      {/* Status indicator dot */}
      <div
        className={cn(
          "w-2 h-2 rounded-full",
          getStatusColor(),
          syncStatus === "healthy" ? "animate-pulse" : "",
        )}
      />

      {/* Status text */}
      <span className={cn("font-semibold text-sm", getStatusTextColor())}>
        {syncStatus.charAt(0).toUpperCase() + syncStatus.slice(1)}
      </span>

      {/* Queue size */}
      {queueSize > 0 && (
        <span className="text-xs text-slate-600 bg-slate-100 px-2 py-1 rounded-md">
          {queueSize} pending
        </span>
      )}

      {/* Sync button */}
      <Button
        onClick={forceSync}
        variant="outline"
        size="sm"
        className="ml-auto"
      >
        Sync Now
      </Button>
    </div>
  );
}
