"use client";

import type {
  SessionData,
  TestResultData,
  WorkflowRunData,
} from "@/modules/sync/sync-types";
import {
  useExecutionStore,
  type WorkflowExecution,
} from "../stores/execution.store.sync";
import {
  type ScenarioRun,
  useScenarioRunStore,
} from "../stores/scenario-run.store.sync";
import {
  type TestResult,
  useTestResultStore,
} from "../stores/test-result.store";
import type { WorkflowRunSnapshot } from "./runner-client";

function parseJSON<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function timeValue(value: string | null | undefined, fallback: string): number {
  return new Date(value || fallback).getTime();
}

function deserializeWorkflowRun(data: WorkflowRunData): WorkflowExecution {
  const metadata = parseJSON<{ scenario_run_ids?: string[] }>(
    data.metadata,
    {},
  );
  return {
    workflowRunId: data.id,
    projectId: data.project_id,
    workflowId: data.workflow_id,
    status: data.status as WorkflowExecution["status"],
    logs: parseJSON<string[]>(data.logs, []),
    result: parseJSON<unknown>(data.summary, data.summary),
    error: data.error,
    startedAt: timeValue(data.started_at, data.created_at),
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
    projectId: data.project_id,
    workflowRunId: data.workflow_run_id ?? "",
    workflowId: data.workflow_id ?? "",
    scenarioId: data.scenario_id ?? "",
    scenarioName: data.scenario_name ?? "Scenario",
    backendSessionId: data.backend_session_id || undefined,
    status: data.status as ScenarioRun["status"],
    result: parseJSON<unknown>(data.result, data.result),
    error: data.error || undefined,
    phase: data.phase,
    checkpointIndex: data.checkpoint_index,
    logs: parseJSON<string[]>(data.logs, []),
    startedAt: timeValue(data.started_at, data.created_at),
    finishedAt: data.completed_at
      ? new Date(data.completed_at).getTime()
      : undefined,
    version: data.version ?? 1,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user_id: data.user_id,
    client_id: data.client_id,
    is_deleted: data.is_deleted,
  };
}

function deserializeTestResult(
  data: TestResultData,
  scenarioRunIdsBySession: Map<string, string>,
): TestResult {
  return {
    id: data.id,
    projectId: data.project_id,
    sessionId: data.session_id,
    workflowRunId: data.workflow_run_id,
    workflowId: data.workflow_id,
    scenarioRunId: scenarioRunIdsBySession.get(data.session_id),
    scenarioId: data.scenario_id,
    scenarioName: data.scenario_name,
    testName: data.test_name,
    testType: data.test_type,
    status: data.status as TestResult["status"],
    resultData: parseJSON<unknown>(data.result_data, null),
    containerLogs: parseJSON<Record<string, string> | undefined>(
      data.container_logs,
      undefined,
    ),
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

export function hydrateWorkflowRunSnapshot(
  snapshot: WorkflowRunSnapshot,
): void {
  const scenarioRunIdsBySession = new Map<string, string>();

  useExecutionStore
    .getState()
    .upsertExecutionFromSync(deserializeWorkflowRun(snapshot.workflowRun));
  useExecutionStore.getState().updateQueueInfo(
    snapshot.workflowRun.id,
    snapshot.queue
      ? {
          position: snapshot.queue.position,
          queuedAt: snapshot.queue.queuedAt,
          workerConcurrency: snapshot.queue.workerConcurrency,
          estimatedRun: snapshot.queue.estimatedRun,
          estimatedWait: snapshot.queue.estimatedWait,
          estimatedTotal: snapshot.queue.estimatedTotal,
        }
      : undefined,
  );

  for (const scenarioRun of snapshot.scenarioRuns || []) {
    if (scenarioRun.is_deleted || !scenarioRun.scenario_id) continue;
    scenarioRunIdsBySession.set(scenarioRun.id, scenarioRun.id);
    useScenarioRunStore
      .getState()
      .upsertScenarioRunFromSync(deserializeScenarioRun(scenarioRun));
  }

  for (const testResult of snapshot.testResults || []) {
    if (testResult.is_deleted) continue;
    useTestResultStore
      .getState()
      .upsertTestResultFromSync(
        deserializeTestResult(testResult, scenarioRunIdsBySession),
      );
  }
}
