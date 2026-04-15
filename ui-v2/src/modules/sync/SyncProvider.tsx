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
import { useProjectContext } from "@/modules/projects/project-context";
import { initializeSyncWithHydration } from "./sync-hydration";
import {
  checkSyncHealth,
  initSync,
  stopSync,
  type SyncConfig,
  syncNow,
} from "./sync-init";
import { syncService } from "./sync-service";

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
  userId: string | null;
  config?: SyncConfig;
  statusPollingInterval?: number;
}

export function SyncProvider({
  children,
  userId,
  config = {},
  statusPollingInterval = 10000,
}: SyncProviderProps) {
  const { activeProjectId } = useProjectContext();
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
    if (!userId || !activeProjectId) {
      stopSync();
      syncService.setEnabled(false);
      setInitialized(false);
      setIsHydrating(false);
      return;
    }

    const initialize = async () => {
      try {
        // Initialize sync config
        initSync({
          baseUrl: config.baseUrl ?? "",
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

    return () => {
      stopSync();
      syncService.setEnabled(false);
    };
  }, [
    checkHealth,
    config.baseUrl,
    config.enabled,
    config.maxBatchSize,
    config.syncInterval,
    userId,
    activeProjectId,
  ]);

  useEffect(() => {
    if (
      !isInitialized ||
      !userId ||
      !activeProjectId ||
      statusPollingInterval <= 0
    )
      return;

    const interval = setInterval(() => {
      checkHealth();
    }, statusPollingInterval);

    return () => clearInterval(interval);
  }, [isInitialized, statusPollingInterval, checkHealth, userId, activeProjectId]);

  useEffect(() => {
    if (!isInitialized || !userId || !activeProjectId || typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void syncNow();
      }
    };

    const handlePageHide = () => {
      syncService.flushOnPageHide();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [isInitialized, userId, activeProjectId]);

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
      <>
        {children}
        {activeProjectId && isHydrating ? (
          <div className="pointer-events-none fixed bottom-4 right-4 z-50 rounded-md border bg-background/90 px-3 py-2 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border border-border border-t-primary" />
              <span>Syncing workspace data...</span>
            </div>
          </div>
        ) : null}
      </>
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
