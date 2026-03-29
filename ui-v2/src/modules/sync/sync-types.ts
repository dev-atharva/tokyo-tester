import type {
  FlowEdge,
  FlowNode,
  JsonValue,
} from "../workflow/types/react-flow-cots";

export type EntityType = "workflow" | "session" | "test_result";
export type ChangeType = "insert" | "update" | "delete";

export interface SyncChange {
  entity_type: EntityType;
  entity_id: string;
  change_type: ChangeType;
  data: JsonValue;
  client_time: string;
  client_version: number;
}

export interface SyncBatchRequest {
  user_id: string;
  client_id: string;
  timestamp: string;
  changes: SyncChange[];
}

export interface ConflictInfo {
  entity_type: EntityType;
  entity_id: string;
  resolution: "server_wins" | "client_wins";
  message: string;
}

export interface SyncError {
  entity_type?: EntityType;
  entity_id?: string;
  message: string;
}

export interface SyncBatchResponse {
  success: boolean;
  processed_count: number;
  conflicts?: ConflictInfo[];
  errors?: SyncError[];
  server_version: number;
}

export interface SyncStatusResponse {
  status: "healthy" | "degraded" | "down";
  server_version: number;
  timestamp: string;
}

export interface WorkflowData {
  id: string;
  name: string;
  description?: string;
  nodes_config: FlowNode[];
  edges_config: FlowEdge[];
  metadata?: Record<string, JsonValue>;
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

export interface SessionData {
  id: string;
  workflow_id?: string;
  status: string;
  result?: JsonValue;
  container_ids?: string[];
  logs?: string[];
  error?: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

export interface TestResultData {
  id: string;
  session_id: string;
  workflow_id: string;
  test_name: string;
  test_type: string;
  status: string;
  result_data?: JsonValue | string | null;
  duration_ms: number;
  executed_at: string;
  created_at: string;
  updated_at: string;
  client_id: string;
  user_id: string;
  is_deleted: boolean;
}

export interface SyncPullResponse {
  workflows?: WorkflowData[];
  sessions?: SessionData[];
  test_results?: TestResultData[];
}
