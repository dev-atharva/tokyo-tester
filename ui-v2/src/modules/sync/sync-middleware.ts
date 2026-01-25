import { StateCreator } from "zustand";
import { StoreMutatorIdentifier } from "zustand";
import { ChangeType, EntityType } from "./sync-types";
import { syncService } from "./sync-service";
import { getOrCreateClientId, getUserId } from "./client-id";

type SyncMiddleware = <
  T,
  MpS extends [StoreMutatorIdentifier, unknown][] = [],
  McS extends [StoreMutatorIdentifier, unknown][] = [],
>(
  config: StateCreator<T, MpS, McS>,
  options: SimpleSyncOptions<T>,
) => StateCreator<T, MpS, McS>;

/**
 * Simplified sync options - much easier to use!
 */
export interface SimpleSyncOptions<T> {
  /** Entity type being synced */
  entityType: EntityType;

  /** Extract entity ID from the state change */
  getEntityId: (state: T) => string | null;

  /** Serialize the entity for transmission */
  serializeEntity: (state: T, entityId: string) => any;

  /** Optional: disable sync */
  enabled?: boolean;
}

/**
 * Simple tracking wrapper - no more manual lastOperation!
 */
class OperationTracker {
  private pendingOps = new Map<string, ChangeType>();

  track(entityId: string, changeType: ChangeType) {
    this.pendingOps.set(entityId, changeType);
  }

  consume(entityId: string): ChangeType | null {
    const changeType = this.pendingOps.get(entityId) || null;
    this.pendingOps.delete(entityId);
    return changeType;
  }

  clear() {
    this.pendingOps.clear();
  }
}

/**
 * Simplified sync middleware - much cleaner!
 */
export const syncMiddleware: SyncMiddleware =
  (config, options) => (set: any, get: any, store: any) => {
    const {
      enabled = true,
      entityType,
      getEntityId,
      serializeEntity,
    } = options;

    const tracker = new OperationTracker();

    const syncSet: typeof set = (partial: any, replace: any) => {
      const prevState = get();

      // Update state first
      set(partial, replace);

      const nextState = get();

      if (!enabled) return;

      // Schedule sync to avoid render conflicts
      queueMicrotask(() => {
        try {
          const entityId = getEntityId(nextState);
          if (!entityId) return;

          const changeType = tracker.consume(entityId);
          if (!changeType) return;

          const data = serializeEntity(nextState, entityId);
          if (!data) return;

          syncService.queueChange({
            entity_type: entityType,
            entity_id: entityId,
            change_type: changeType,
            data,
          });
        } catch (error) {
          console.error(`[SyncMiddleware:${entityType}]`, error);
        }
      });
    };

    // Expose tracker for stores to use
    (store as any).__syncTracker = tracker;

    return config(syncSet, get, store);
  };

/**
 * Helper to track sync operations in stores
 */
export function trackSync(
  store: any,
  entityId: string,
  changeType: ChangeType,
): void {
  const tracker = store.__syncTracker as OperationTracker;
  if (tracker) {
    tracker.track(entityId, changeType);
  }
}

/**
 * Add sync metadata to entities
 */
export function addSyncMetadata<T extends Record<string, any>>(
  entity: T,
): T & {
  version: number;
  created_at: string;
  user_id: string;
  updated_at: string;
  client_id: string;
  is_deleted: boolean;
} {
  const now = new Date().toISOString();
  return {
    ...entity,
    version: entity.version || 1,
    created_at: entity.created_at || now,
    updated_at: now,
    user_id: getUserId(),
    client_id: getOrCreateClientId(),
    is_deleted: entity.is_deleted || false,
  };
}

/**
 * Mark entity as deleted (soft delete)
 */
export function markAsDeleted<T extends Record<string, any>>(
  entity: T,
): T & {
  is_deleted: boolean;
  updated_at: string;
} {
  return {
    ...entity,
    is_deleted: true,
    updated_at: new Date().toISOString(),
  };
}
