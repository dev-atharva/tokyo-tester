"use client";

import { syncService } from "./sync-service";
import {
  useWorkflowStore,
  Workflow,
} from "../workflow/stores/workflow.store.sync";
import {
  ExecutionStatus,
  useExecutionStore,
  WorkflowExecution,
} from "../workflow/stores/execution.store.sync";
import {
  useTestResultStore,
  TestResult,
} from "@/modules/workflow/stores/test-result.store";
import { SessionData, WorkflowData, TestResultData } from "./sync-types";

interface HydrationResult {
  success: boolean;
  workflowCount: number;
  sessionCount: number;
  testResultCount: number;
  error?: string;
}

interface HydrationStats {
  workflows: Map<string, WorkflowData>;
  sessions: Map<string, SessionData>;
  testResults: Map<string, TestResultData>;
  sessionsByWorkflow: Map<string, SessionData[]>;
  testResultsBySession: Map<string, TestResultData[]>;
}

/**
 * Main hydration function - pulls data from server and reconstructs hierarchy
 */
export async function hydrateFromServer(): Promise<HydrationResult> {
  try {
    console.log(
      "[SyncHydration] Starting hierarchical hydration from server...",
    );

    // Pull all data from server
    const pullResponse = await syncService.pull();
    console.log("[SyncHydration] Pull response:", {
      workflows: pullResponse.workflows?.length || 0,
      sessions: pullResponse.sessions?.length || 0,
      testResults: pullResponse.test_results?.length || 0,
    });

    // Build hierarchical structure
    const stats = buildHierarchicalStructure(pullResponse);

    // Hydrate workflows first
    const workflowCount = hydrateWorkflows(stats);

    // Hydrate sessions
    const sessionCount = hydrateSessions(stats);

    // Hydrate test results
    const testResultCount = hydrateTestResults(stats);

    if (workflowCount === 0 && sessionCount === 0 && testResultCount === 0) {
      console.log("[SyncHydration] No server data to hydrate");
    } else {
      console.log(
        `[SyncHydration] ✅ Hydrated ${workflowCount} workflows, ${sessionCount} sessions, ${testResultCount} test results`,
      );
      console.log(
        `[SyncHydration] Hierarchy: ${stats.sessionsByWorkflow.size} workflows have sessions, ${stats.testResultsBySession.size} sessions have results`,
      );
    }

    return {
      success: true,
      workflowCount,
      sessionCount,
      testResultCount,
    };
  } catch (error) {
    console.error("[SyncHydration] Failed:", error);
    return {
      success: false,
      workflowCount: 0,
      sessionCount: 0,
      testResultCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build hierarchical maps for quick lookups
 */
function buildHierarchicalStructure(pullResponse: any): HydrationStats {
  const stats: HydrationStats = {
    workflows: new Map(),
    sessions: new Map(),
    testResults: new Map(),
    sessionsByWorkflow: new Map(),
    testResultsBySession: new Map(),
  };

  // Index workflows
  if (pullResponse.workflows) {
    for (const wf of pullResponse.workflows) {
      stats.workflows.set(wf.id, wf);
    }
  }

  // Index sessions and group by workflow
  if (pullResponse.sessions) {
    for (const sess of pullResponse.sessions) {
      stats.sessions.set(sess.id, sess);

      // Group by workflow
      if (sess.workflow_id) {
        const workflowSessions =
          stats.sessionsByWorkflow.get(sess.workflow_id) || [];
        workflowSessions.push(sess);
        stats.sessionsByWorkflow.set(sess.workflow_id, workflowSessions);
      }
    }
  }

  // Index test results and group by session
  if (pullResponse.test_results) {
    for (const tr of pullResponse.test_results) {
      stats.testResults.set(tr.id, tr);

      // Group by session
      if (tr.session_id) {
        const sessionResults =
          stats.testResultsBySession.get(tr.session_id) || [];
        sessionResults.push(tr);
        stats.testResultsBySession.set(tr.session_id, sessionResults);
      }
    }
  }

  return stats;
}

/**
 * Hydrate workflows into store
 */
function hydrateWorkflows(stats: HydrationStats): number {
  let count = 0;

  for (const [workflowId, workflowData] of stats.workflows) {
    try {
      // Skip deleted workflows
      if (workflowData.is_deleted) {
        console.log(`[SyncHydration] Skipping deleted workflow: ${workflowId}`);
        continue;
      }

      const workflow = deserializeWorkflow(workflowData);
      useWorkflowStore.getState().upsertWorkflowFromSync(workflow);

      const sessionCount =
        stats.sessionsByWorkflow.get(workflowId)?.length || 0;
      console.log(
        `[SyncHydration] ✓ Workflow: ${workflow.name} (${workflowId}) - ${sessionCount} sessions`,
      );

      count++;
    } catch (error) {
      console.error(
        `[SyncHydration] Failed to hydrate workflow ${workflowId}:`,
        error,
      );
    }
  }

  return count;
}

/**
 * Hydrate sessions into store (without embedded test results)
 */
function hydrateSessions(stats: HydrationStats): number {
  let count = 0;

  for (const [sessionId, sessionData] of stats.sessions) {
    try {
      // Skip deleted sessions
      if (sessionData.is_deleted) {
        console.log(`[SyncHydration] Skipping deleted session: ${sessionId}`);
        continue;
      }

      // Get test result count for logging
      const testResultCount =
        stats.testResultsBySession.get(sessionId)?.length || 0;

      // Deserialize session WITHOUT embedded test results
      const execution = deserializeSession(sessionData);
      useExecutionStore.getState().upsertExecutionFromSync(execution);

      console.log(
        `[SyncHydration] ✓ Session: ${sessionId} (${execution.status}) - workflow: ${execution.workflowId}, ${testResultCount} test results`,
      );

      count++;
    } catch (error) {
      console.error(
        `[SyncHydration] Failed to hydrate session ${sessionId}:`,
        error,
      );
    }
  }

  return count;
}

/**
 * Hydrate test results into their own store
 */
function hydrateTestResults(stats: HydrationStats): number {
  let count = 0;

  for (const [testResultId, testResultData] of stats.testResults) {
    try {
      // Skip deleted test results
      if (testResultData.is_deleted) {
        console.log(
          `[SyncHydration] Skipping deleted test result: ${testResultId}`,
        );
        continue;
      }

      const testResult = deserializeTestResult(testResultData);
      useTestResultStore.getState().upsertTestResultFromSync(testResult);

      console.log(
        `[SyncHydration] ✓ Test Result: ${testResult.testName} (${testResultId}) - session: ${testResult.sessionId}, status: ${testResult.status}`,
      );

      count++;
    } catch (error) {
      console.error(
        `[SyncHydration] Failed to hydrate test result ${testResultId}:`,
        error,
      );
    }
  }

  return count;
}

/**
 * Deserialize workflow from API format to store format
 */
function deserializeWorkflow(data: WorkflowData): Workflow {
  const nodes = parseJSON<any[]>(data.nodes_config, []);
  const edges = parseJSON<any[]>(data.edges_config, []);
  const metadata = parseJSON<Record<string, any>>(data.metadata, {});

  return {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    nodes,
    edges,
    customTestOrder: metadata.customTestOrder ?? {},
    version: data.version,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

/**
 * Deserialize session from API format to store format
 */
function deserializeSession(data: SessionData): WorkflowExecution {
  const logs = parseJSON<string[]>(data.logs, []);
  const result = parseJSON<any>(data.result, null);

  return {
    sessionId: data.id,
    workflowId: data.workflow_id ?? "",
    status: (data.status as ExecutionStatus) ?? "idle",
    logs,
    result: result || undefined,
    error: data.error ?? undefined,
    startedAt: data.started_at
      ? new Date(data.started_at).getTime()
      : new Date(data.created_at).getTime(),
    finishedAt: data.completed_at
      ? new Date(data.completed_at).getTime()
      : undefined,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    version: new Date(data.updated_at).getTime(),
    is_deleted: data.is_deleted,
  };
}

/**
 * Deserialize test result from API format to store format
 * FIXED: Now uses data.updated_at instead of data.created_at
 */
function deserializeTestResult(data: TestResultData): TestResult {
  const resultData = parseJSON<any>(data.result_data, null);

  return {
    id: data.id,
    sessionId: data.session_id,
    workflowId: data.workflow_id,
    testName: data.test_name,
    testType: data.test_type,
    status: data.status as TestResult["status"],
    resultData,
    durationMs: data.duration_ms,
    executedAt: data.executed_at,
    version: 1,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

/**
 * Check if hydration is needed (stores are empty)
 */
export function needsHydration(): boolean {
  const workflows = useWorkflowStore.getState().workflows;
  const executions = useExecutionStore.getState().executions;
  const testResults = useTestResultStore.getState().testResults;

  const isEmpty =
    Object.keys(workflows).length === 0 &&
    Object.keys(executions).length === 0 &&
    Object.keys(testResults).length === 0;

  return isEmpty;
}

/**
 * Initialize sync system with hydration
 */
export async function initializeSyncWithHydration(): Promise<void> {
  console.log("[SyncHydration] Initializing sync system...");

  try {
    // Always hydrate from server to get latest data
    console.log("[SyncHydration] Hydrating from server...");
    const result = await hydrateFromServer();

    if (!result.success) {
      console.error("[SyncHydration] Hydration failed:", result.error);
      // Don't throw - continue with local data
    }

    // Start sync service
    syncService.start();
    console.log("[SyncHydration] Sync service started");
  } catch (error) {
    console.error("[SyncHydration] Initialization error:", error);
    // Don't throw - allow app to continue with local data
  }
}

/**
 * Force re-hydration from server (refresh)
 */
export async function rehydrateFromServer(): Promise<HydrationResult> {
  console.log("[SyncHydration] Force re-hydration requested...");
  return await hydrateFromServer();
}

/**
 * Get hydration statistics
 */
export function getHydrationStats(): {
  workflows: number;
  sessions: number;
  testResults: number;
  sessionsByWorkflow: Map<string, number>;
  testResultsBySession: Map<string, number>;
} {
  const workflowStore = useWorkflowStore.getState();
  const executionStore = useExecutionStore.getState();
  const testResultStore = useTestResultStore.getState();

  const sessionsByWorkflow = new Map<string, number>();
  const testResultsBySession = new Map<string, number>();

  Object.values(executionStore.executions).forEach((execution) => {
    if (!execution.is_deleted && execution.workflowId) {
      const count = sessionsByWorkflow.get(execution.workflowId) || 0;
      sessionsByWorkflow.set(execution.workflowId, count + 1);
    }
  });

  Object.values(testResultStore.testResults).forEach((testResult) => {
    if (!testResult.is_deleted && testResult.sessionId) {
      const count = testResultsBySession.get(testResult.sessionId) || 0;
      testResultsBySession.set(testResult.sessionId, count + 1);
    }
  });

  return {
    workflows: Object.keys(workflowStore.workflows).filter(
      (id) => !workflowStore.workflows[id].is_deleted,
    ).length,
    sessions: Object.keys(executionStore.executions).filter(
      (id) => !executionStore.executions[id].is_deleted,
    ).length,
    testResults: Object.keys(testResultStore.testResults).filter(
      (id) => !testResultStore.testResults[id].is_deleted,
    ).length,
    sessionsByWorkflow,
    testResultsBySession,
  };
}

/**
 * Safe JSON parsing with fallback
 */
function parseJSON<T>(value: any, fallback: T): T {
  try {
    if (value === null || value === undefined) return fallback;
    if (typeof value === "string") {
      // Handle empty strings
      if (value.trim() === "") return fallback;
      return JSON.parse(value);
    }
    return value as T;
  } catch (error) {
    console.warn("[SyncHydration] JSON parse failed, using fallback:", error);
    return fallback;
  }
}
