"use client";

import {
  type WorkflowExecution,
  useExecutionStore,
} from "@/modules/workflow/stores/execution.store.sync";
import {
  type ScenarioRun,
  useScenarioRunStore,
} from "@/modules/workflow/stores/scenario-run.store.sync";
import {
  useScenarioStore,
} from "@/modules/workflow/stores/scenario.store.sync";
import {
  type TestResult,
  useTestResultStore,
} from "@/modules/workflow/stores/test-result.store";
import {
  type Workflow,
  useWorkflowStore,
} from "../workflow/stores/workflow.store.sync";
import type {
  FlowEdge,
  FlowNode,
  Scenario,
  ScenarioTestDefinition,
} from "../workflow/types/react-flow-cots";
import { syncService } from "./sync-service";
import type {
  ScenarioData,
  SessionData,
  SyncPullResponse,
  TestResultData,
  WorkflowData,
  WorkflowRunData,
} from "./sync-types";

interface HydrationResult {
  success: boolean;
  workflowCount: number;
  scenarioCount: number;
  workflowRunCount: number;
  scenarioRunCount: number;
  testResultCount: number;
  error?: string;
}

export async function hydrateFromServer(): Promise<HydrationResult> {
  try {
    const pullResponse = await syncService.pull();

    const workflowCount = hydrateWorkflows(pullResponse.workflows || []);
    const scenarioCount = hydrateScenarios(pullResponse.scenarios || []);
    const workflowRunCount = hydrateWorkflowRuns(pullResponse.workflow_runs || []);
    const scenarioRunCount = hydrateScenarioRuns(pullResponse.sessions || []);
    const testResultCount = hydrateTestResults(pullResponse.test_results || []);

    return {
      success: true,
      workflowCount,
      scenarioCount,
      workflowRunCount,
      scenarioRunCount,
      testResultCount,
    };
  } catch (error) {
    return {
      success: false,
      workflowCount: 0,
      scenarioCount: 0,
      workflowRunCount: 0,
      scenarioRunCount: 0,
      testResultCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hydrateWorkflows(workflows: WorkflowData[]): number {
  let count = 0;
  for (const workflow of workflows) {
    if (workflow.is_deleted) {
      continue;
    }
    useWorkflowStore.getState().upsertWorkflowFromSync(deserializeWorkflow(workflow));
    count += 1;
  }
  return count;
}

function hydrateScenarios(scenarios: ScenarioData[]): number {
  let count = 0;
  for (const scenario of scenarios) {
    if (scenario.is_deleted) {
      continue;
    }
    useScenarioStore.getState().upsertScenarioFromSync(deserializeScenario(scenario));
    count += 1;
  }
  return count;
}

function hydrateWorkflowRuns(workflowRuns: WorkflowRunData[]): number {
  let count = 0;
  for (const workflowRun of workflowRuns) {
    if (workflowRun.is_deleted) {
      continue;
    }
    useExecutionStore
      .getState()
      .upsertExecutionFromSync(deserializeWorkflowRun(workflowRun));
    count += 1;
  }
  return count;
}

function hydrateScenarioRuns(scenarioRuns: SessionData[]): number {
  let count = 0;
  for (const scenarioRun of scenarioRuns) {
    if (scenarioRun.is_deleted || !scenarioRun.scenario_id) {
      continue;
    }
    useScenarioRunStore
      .getState()
      .upsertScenarioRunFromSync(deserializeScenarioRun(scenarioRun));
    count += 1;
  }
  return count;
}

function hydrateTestResults(testResults: TestResultData[]): number {
  let count = 0;
  for (const testResult of testResults) {
    if (testResult.is_deleted) {
      continue;
    }
    useTestResultStore
      .getState()
      .upsertTestResultFromSync(deserializeTestResult(testResult));
    count += 1;
  }
  return count;
}

function deserializeWorkflow(data: WorkflowData): Workflow {
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? "",
    nodes: parseJSON<FlowNode[]>(data.nodes_config, []),
    edges: parseJSON<FlowEdge[]>(data.edges_config, []),
    customTestOrder: {},
    version: data.version,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

function deserializeScenario(data: ScenarioData): Scenario {
  return {
    id: data.id,
    workflowId: data.workflow_id,
    name: data.name,
    description: data.description ?? "",
    tests: parseJSON<ScenarioTestDefinition[]>(data.tests_config, []),
    testOrder: data.test_order || [],
    version: data.version,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

function deserializeWorkflowRun(data: WorkflowRunData): WorkflowExecution {
  const metadata = parseJSON<{ scenario_run_ids?: string[] }>(data.metadata, {});

  return {
    workflowRunId: data.id,
    workflowId: data.workflow_id,
    status: data.status as WorkflowExecution["status"],
    logs: data.logs || [],
    result: data.summary,
    error: data.error,
    startedAt: data.started_at
      ? new Date(data.started_at).getTime()
      : new Date(data.created_at).getTime(),
    finishedAt: data.completed_at
      ? new Date(data.completed_at).getTime()
      : undefined,
    scenarioRunIds: metadata.scenario_run_ids || [],
    version: data.version,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

function deserializeScenarioRun(data: SessionData): ScenarioRun {
  return {
    id: data.id,
    workflowRunId: data.workflow_run_id ?? "",
    workflowId: data.workflow_id ?? "",
    scenarioId: data.scenario_id ?? "",
    scenarioName: data.scenario_name ?? "Scenario",
    backendSessionId: data.backend_session_id || undefined,
    status: data.status as ScenarioRun["status"],
    result: data.result,
    error: data.error || undefined,
    logs: data.logs || [],
    startedAt: data.started_at
      ? new Date(data.started_at).getTime()
      : new Date(data.created_at).getTime(),
    finishedAt: data.completed_at
      ? new Date(data.completed_at).getTime()
      : undefined,
    version: 1,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

function deserializeTestResult(data: TestResultData): TestResult {
  return {
    id: data.id,
    sessionId: data.session_id,
    workflowRunId: data.workflow_run_id,
    workflowId: data.workflow_id,
    scenarioId: data.scenario_id,
    scenarioName: data.scenario_name,
    testName: data.test_name,
    testType: data.test_type,
    status: data.status as TestResult["status"],
    resultData: parseJSON<unknown>(data.result_data, null),
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

export async function initializeSyncWithHydration(): Promise<void> {
  await hydrateFromServer().catch(() => undefined);
  syncService.start();
}

export async function rehydrateFromServer(): Promise<HydrationResult> {
  return hydrateFromServer();
}

export function needsHydration(): boolean {
  return (
    Object.keys(useWorkflowStore.getState().workflows).length === 0 &&
    Object.keys(useScenarioStore.getState().scenarios).length === 0 &&
    Object.keys(useExecutionStore.getState().executions).length === 0 &&
    Object.keys(useScenarioRunStore.getState().scenarioRuns).length === 0 &&
    Object.keys(useTestResultStore.getState().testResults).length === 0
  );
}

function parseJSON<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value !== "string") {
    return value as T;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
