import { generateId } from "@/lib/generate-id";
import {
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import type { Workflow } from "../stores/workflow.store.sync";
import type {
  FlowNode,
  Scenario,
  WorkflowBundle,
  WorkflowBundleScenario,
} from "../types/react-flow-cots";

export const WORKFLOW_BUNDLE_SCHEMA_VERSION = 1;
export const WORKFLOW_BUNDLE_KIND = "cots.workflow-bundle";

type ExportableWorkflow = Pick<
  Workflow,
  "name" | "description" | "nodes" | "edges"
>;
type ExportableScenario = Pick<
  Scenario,
  "name" | "description" | "tests" | "testOrder"
>;

export interface ImportedWorkflowBundleData {
  workflow: ExportableWorkflow;
  scenarios: WorkflowBundleScenario[];
}

export function createWorkflowBundle(
  workflow: ExportableWorkflow,
  scenarios: ExportableScenario[],
): WorkflowBundle {
  const bundle: WorkflowBundle = {
    schemaVersion: WORKFLOW_BUNDLE_SCHEMA_VERSION,
    kind: WORKFLOW_BUNDLE_KIND,
    workflow: {
      name: workflow.name,
      description: workflow.description || "",
      nodes: sanitizeNodesForBundle(workflow.nodes),
      edges: cloneValue(workflow.edges),
    },
    scenarios: scenarios.map((scenario) => ({
      name: scenario.name,
      description: scenario.description || "",
      tests: cloneValue(scenario.tests),
      testOrder: [...scenario.testOrder],
    })),
  };

  validateWorkflowBundle(bundle);
  return bundle;
}

export function parseWorkflowBundle(raw: string): WorkflowBundle {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("Workflow bundle is not valid JSON.");
  }

  validateWorkflowBundle(parsed);
  return parsed;
}

export function validateWorkflowBundle(
  value: unknown,
): asserts value is WorkflowBundle {
  if (!value || typeof value !== "object") {
    throw new Error("Workflow bundle must be a JSON object.");
  }

  const bundle = value as Partial<WorkflowBundle>;

  if (bundle.schemaVersion !== WORKFLOW_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported workflow bundle schema version: ${String(bundle.schemaVersion)}.`,
    );
  }

  if (bundle.kind !== WORKFLOW_BUNDLE_KIND) {
    throw new Error("Workflow bundle kind must be cots.workflow-bundle.");
  }

  if (!bundle.workflow || typeof bundle.workflow !== "object") {
    throw new Error("Workflow bundle must include a workflow definition.");
  }

  if (!bundle.workflow.name?.trim()) {
    throw new Error("Workflow bundle must include a workflow name.");
  }

  if (!Array.isArray(bundle.workflow.nodes)) {
    throw new Error("Workflow bundle workflow.nodes must be an array.");
  }

  if (!Array.isArray(bundle.workflow.edges)) {
    throw new Error("Workflow bundle workflow.edges must be an array.");
  }

  if (!Array.isArray(bundle.scenarios) || bundle.scenarios.length === 0) {
    throw new Error("Workflow bundle must include at least one scenario.");
  }

  const workflowValidation = validateWorkflowGraph(
    bundle.workflow.nodes,
    bundle.workflow.edges,
  );
  if (!workflowValidation.valid) {
    throw new Error(
      workflowValidation.errors.map((error) => error.message).join("; "),
    );
  }

  const graph = translateWorkflowGraphToServiceGraph(
    bundle.workflow.nodes,
    bundle.workflow.edges,
  );

  bundle.scenarios.forEach((scenario, index) => {
    validateBundleScenario(scenario, index);
    const scenarioValidation = validateScenario(graph, {
      id: `bundle-scenario-${index}`,
      name: scenario.name,
      tests: scenario.tests,
      testOrder: scenario.testOrder,
    });

    if (!scenarioValidation.valid) {
      throw new Error(
        scenarioValidation.errors.map((error) => error.message).join("; "),
      );
    }
  });
}

export function materializeWorkflowBundle(
  bundle: WorkflowBundle,
  existingWorkflowNames: Iterable<string>,
): ImportedWorkflowBundleData {
  validateWorkflowBundle(bundle);

  return {
    workflow: {
      name: getUniqueWorkflowName(bundle.workflow.name, existingWorkflowNames),
      description: bundle.workflow.description || "",
      nodes: sanitizeNodesForBundle(bundle.workflow.nodes),
      edges: cloneValue(bundle.workflow.edges),
    },
    scenarios: bundle.scenarios.map((scenario) =>
      cloneScenarioForImport(scenario),
    ),
  };
}

export function createClonedWorkflowBundle(
  workflow: ExportableWorkflow,
  scenarios: ExportableScenario[],
  existingWorkflowNames: Iterable<string>,
): ImportedWorkflowBundleData {
  const bundle = createWorkflowBundle(workflow, scenarios);
  const materialized = materializeWorkflowBundle(bundle, existingWorkflowNames);
  return {
    ...materialized,
    workflow: {
      ...materialized.workflow,
      name: getUniqueWorkflowName(
        `${workflow.name} Copy`,
        existingWorkflowNames,
      ),
    },
  };
}

function validateBundleScenario(
  scenario: Partial<WorkflowBundleScenario>,
  index: number,
) {
  if (!scenario || typeof scenario !== "object") {
    throw new Error(`Scenario ${index + 1} must be an object.`);
  }

  if (!scenario.name?.trim()) {
    throw new Error(`Scenario ${index + 1} must include a name.`);
  }

  if (!Array.isArray(scenario.tests) || scenario.tests.length === 0) {
    throw new Error(
      `Scenario "${scenario.name}" must include at least one test.`,
    );
  }

  if (!Array.isArray(scenario.testOrder)) {
    throw new Error(
      `Scenario "${scenario.name}" must include a testOrder array.`,
    );
  }

  const testIds = scenario.tests.map((test) => test.id);
  const uniqueTestIds = new Set(testIds);
  if (uniqueTestIds.size !== testIds.length) {
    throw new Error(`Scenario "${scenario.name}" contains duplicate test ids.`);
  }

  const orderIds = scenario.testOrder;
  if (new Set(orderIds).size !== orderIds.length) {
    throw new Error(
      `Scenario "${scenario.name}" contains duplicate testOrder ids.`,
    );
  }

  if (orderIds.length !== testIds.length) {
    throw new Error(
      `Scenario "${scenario.name}" testOrder must include every test exactly once.`,
    );
  }

  for (const testId of orderIds) {
    if (!uniqueTestIds.has(testId)) {
      throw new Error(
        `Scenario "${scenario.name}" testOrder references unknown test "${testId}".`,
      );
    }
  }
}

function cloneScenarioForImport(
  scenario: WorkflowBundleScenario,
): WorkflowBundleScenario {
  const idMap = new Map<string, string>();
  for (const test of scenario.tests) {
    idMap.set(test.id, generateId());
  }

  const tests = scenario.tests.map((test) => {
    const nextTest = cloneValue(test);
    nextTest.id = idMap.get(test.id) || generateId();
    nextTest.dependsOnTestIds = (test.dependsOnTestIds || [])
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id));
    return nextTest;
  });

  return {
    name: scenario.name,
    description: scenario.description || "",
    tests,
    testOrder: scenario.testOrder
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id)),
  };
}

function sanitizeNodesForBundle(nodes: FlowNode[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: cloneValue(node.position),
    selected: node.selected,
    dragging: node.dragging,
    zIndex: node.zIndex,
    hidden: node.hidden,
    deletable: node.deletable,
    draggable: node.draggable,
    selectable: node.selectable,
    connectable: node.connectable,
    resizing: node.resizing,
    width: node.width,
    height: node.height,
    parentId: node.parentId,
    extent: cloneValue(node.extent),
    expandParent: node.expandParent,
    sourcePosition: node.sourcePosition,
    targetPosition: node.targetPosition,
    style: cloneValue(node.style),
    className: node.className,
    ariaLabel: node.ariaLabel,
    focusable: node.focusable,
    data: {
      label: node.data.label,
      description: node.data.description,
      service: {
        type: node.data.service.type,
        image: node.data.service.image,
        command: cloneValue(node.data.service.command),
        ports: cloneValue(node.data.service.ports),
        env: cloneValue(node.data.service.env),
        waitStratergy: cloneValue(node.data.service.waitStratergy),
        initScripts: cloneValue(node.data.service.initScripts),
      },
      tests: undefined,
      onDelete: undefined,
    },
  }));
}

function getUniqueWorkflowName(
  baseName: string,
  existingWorkflowNames: Iterable<string>,
): string {
  const trimmed = baseName.trim() || "Imported Workflow";
  const existing = new Set(existingWorkflowNames);

  if (!existing.has(trimmed)) {
    return trimmed;
  }

  let suffix = 2;
  while (existing.has(`${trimmed} ${suffix}`)) {
    suffix += 1;
  }

  return `${trimmed} ${suffix}`;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
