import type { WorkflowExecution } from "../stores/execution.store.sync";
import type { Workflow } from "../stores/workflow.store.sync";
import type {
  FlowEdge,
  FlowNode,
  Scenario,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";

export type WorkflowListState =
  | "loading"
  | "no-project"
  | "empty-editable"
  | "empty-readonly"
  | "populated";

export interface WorkflowListSummary {
  workflows: number;
  services: number;
  scenarios: number;
  executions: number;
}

export interface WorkflowCardSummary {
  services: number;
  scenarios: number;
  executions: number;
  latestExecution?: WorkflowExecution;
}

export interface ServiceRemovalImpact {
  connectedEdges: number;
  referencedTests: number;
  referencedScenarios: number;
}

export function resolveWorkflowListState({
  isReady,
  hasProject,
  canEdit,
  workflowCount,
}: {
  isReady: boolean;
  hasProject: boolean;
  canEdit: boolean;
  workflowCount: number;
}): WorkflowListState {
  if (!isReady) return "loading";
  if (!hasProject) return "no-project";
  if (workflowCount > 0) return "populated";
  return canEdit ? "empty-editable" : "empty-readonly";
}

export function summarizeWorkflowList(
  workflows: Workflow[],
  scenarios: Scenario[],
  executions: WorkflowExecution[],
): WorkflowListSummary {
  const workflowIds = new Set(workflows.map((workflow) => workflow.id));
  return {
    workflows: workflows.length,
    services: workflows.reduce(
      (total, workflow) => total + workflow.nodes.length,
      0,
    ),
    scenarios: scenarios.filter(
      (scenario) =>
        !scenario.is_deleted && workflowIds.has(scenario.workflowId),
    ).length,
    executions: executions.filter(
      (execution) =>
        !execution.is_deleted && workflowIds.has(execution.workflowId),
    ).length,
  };
}

export function summarizeWorkflowCard(
  workflow: Workflow,
  scenarios: Scenario[],
  executions: WorkflowExecution[],
): WorkflowCardSummary {
  const workflowScenarios = scenarios.filter(
    (scenario) => !scenario.is_deleted && scenario.workflowId === workflow.id,
  );
  const workflowExecutions = executions
    .filter(
      (execution) =>
        !execution.is_deleted && execution.workflowId === workflow.id,
    )
    .sort((left, right) => right.startedAt - left.startedAt);

  return {
    services: workflow.nodes.length,
    scenarios: workflowScenarios.length,
    executions: workflowExecutions.length,
    latestExecution: workflowExecutions[0],
  };
}

export function getServiceRemovalImpact(
  node: FlowNode,
  edges: FlowEdge[],
  scenarios: Scenario[],
): ServiceRemovalImpact {
  const referencedScenarioIds = new Set<string>();
  let referencedTests = 0;

  for (const scenario of scenarios) {
    if (scenario.is_deleted) continue;
    for (const test of scenario.tests) {
      if (!testReferencesService(test, node)) continue;
      referencedTests += 1;
      referencedScenarioIds.add(scenario.id);
    }
  }

  return {
    connectedEdges: edges.filter(
      (edge) => edge.source === node.id || edge.target === node.id,
    ).length,
    referencedTests,
    referencedScenarios: referencedScenarioIds.size,
  };
}

export function removeServiceFromGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeId: string,
) {
  return {
    nodes: nodes.filter((node) => node.id !== nodeId),
    edges: edges.filter(
      (edge) => edge.source !== nodeId && edge.target !== nodeId,
    ),
  };
}

function testReferencesService(
  test: ScenarioTestDefinition,
  node: FlowNode,
): boolean {
  const candidates = new Set(
    [
      node.id,
      node.data.label,
      sanitizeServiceName(node.id),
      sanitizeServiceName(node.data.label),
    ]
      .filter(Boolean)
      .map((value) => value.trim().toLowerCase()),
  );
  const references = [
    ...test.targetServices,
    test.documentConfig?.service,
    test.cacheConfig?.service,
    test.queueConfig?.service,
  ].filter((value): value is string => Boolean(value));

  return references.some((reference) => {
    const normalized = reference.trim().toLowerCase();
    return (
      candidates.has(normalized) ||
      candidates.has(sanitizeServiceName(reference).toLowerCase())
    );
  });
}

function sanitizeServiceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
