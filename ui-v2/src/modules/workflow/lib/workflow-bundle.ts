import { generateId } from "@/lib/generate-id";
import {
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import type { Workflow } from "../stores/workflow.store.sync";
import type {
  FlowEdge,
  FlowNode,
  ScenarioStep,
  Scenario,
  WorkflowBundle,
  WorkflowBundleScenario,
} from "../types/react-flow-cots";
import {
  EDGE_READINESS_OPTIONS,
  EDGE_RELATIONS,
  normalizeEdges,
} from "./edge-model";

export const WORKFLOW_BUNDLE_SCHEMA_VERSION = 2;
export const WORKFLOW_BUNDLE_SCHEMA_VERSION_V3 = 3;
export const PREFERRED_WORKFLOW_BUNDLE_SCHEMA_VERSION =
  WORKFLOW_BUNDLE_SCHEMA_VERSION_V3;
export const WORKFLOW_BUNDLE_KIND = "cots.workflow-bundle";

type ExportableWorkflow = Pick<
  Workflow,
  "name" | "description" | "nodes" | "edges"
>;
type ExportableScenario =
  | Pick<
      Scenario,
      | "name"
      | "description"
      | "executionModel"
      | "tests"
      | "testOrder"
      | "environment"
      | "steps"
      | "stepOrder"
    >
  | Pick<Scenario, "name" | "description" | "tests" | "testOrder">;

export interface ImportedWorkflowBundleData {
  workflow: ExportableWorkflow;
  scenarios: WorkflowBundleScenario[];
}

export function createWorkflowBundle(
  workflow: ExportableWorkflow,
  scenarios: ExportableScenario[],
): WorkflowBundle {
  const schemaVersion = scenarios.some(
    (scenario) =>
      "executionModel" in scenario && scenario.executionModel === "journey",
  )
    ? WORKFLOW_BUNDLE_SCHEMA_VERSION_V3
    : WORKFLOW_BUNDLE_SCHEMA_VERSION;
  const bundle: WorkflowBundle = {
    schemaVersion,
    kind: WORKFLOW_BUNDLE_KIND,
    workflow: {
      name: workflow.name,
      description: workflow.description || "",
      nodes: sanitizeNodesForBundle(workflow.nodes),
      edges: sanitizeEdgesForBundle(workflow.edges),
    },
    scenarios: scenarios.map((scenario) => {
      const executionModel =
        "executionModel" in scenario ? scenario.executionModel : "legacy-tests";
      if (schemaVersion === WORKFLOW_BUNDLE_SCHEMA_VERSION_V3) {
        if (executionModel === "journey" && "environment" in scenario) {
          return {
            name: scenario.name,
            description: scenario.description || "",
            executionModel,
            environment: cloneValue(scenario.environment),
            steps: cloneValue(scenario.steps),
            stepOrder: [...scenario.stepOrder],
          } as WorkflowBundleScenario;
        }
        return {
          name: scenario.name,
          description: scenario.description || "",
          executionModel: "legacy-tests" as const,
          tests: cloneValue(scenario.tests),
          testOrder: [...scenario.testOrder],
        };
      }
      return {
        name: scenario.name,
        description: scenario.description || "",
        tests: cloneValue(scenario.tests),
        testOrder: [...scenario.testOrder],
      };
    }),
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
  return normalizeWorkflowBundle(parsed);
}

export function validateWorkflowBundle(
  value: unknown,
): asserts value is WorkflowBundle {
  if (!value || typeof value !== "object") {
    throw new Error("Workflow bundle must be a JSON object.");
  }

  const bundle = value as Partial<WorkflowBundle>;

  if (
    bundle.schemaVersion !== 1 &&
    bundle.schemaVersion !== 2 &&
    bundle.schemaVersion !== 3
  ) {
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

  for (const edge of bundle.workflow.edges) {
    if (edge.data?.relation && !EDGE_RELATIONS.includes(edge.data.relation)) {
      throw new Error(`Edge "${edge.id}" has an invalid relation.`);
    }
    if (
      edge.data?.readiness &&
      !EDGE_READINESS_OPTIONS.includes(edge.data.readiness)
    ) {
      throw new Error(`Edge "${edge.id}" has invalid readiness metadata.`);
    }
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
    const executionModel =
      bundle.schemaVersion === 3 ? scenario.executionModel : "legacy-tests";
    if (executionModel === "journey") {
      validateJourneyBundleScenario(scenario, index, graph.services);
    } else {
      validateLegacyBundleScenario(scenario, index, bundle.schemaVersion === 3);
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
      edges: normalizeEdges(
        cloneValue(bundle.workflow.edges),
        bundle.schemaVersion === 1,
      ),
    },
    scenarios: bundle.scenarios.map((scenario) =>
      cloneScenarioForImport(scenario),
    ),
  };
}

function normalizeWorkflowBundle(bundle: WorkflowBundle): WorkflowBundle {
  return {
    ...bundle,
    schemaVersion:
      bundle.schemaVersion === 1
        ? WORKFLOW_BUNDLE_SCHEMA_VERSION
        : bundle.schemaVersion,
    workflow: {
      ...bundle.workflow,
      edges: normalizeEdges(
        cloneValue(bundle.workflow.edges as FlowEdge[]),
        bundle.schemaVersion === 1,
      ),
    },
    scenarios: bundle.scenarios.map((scenario) => {
      const executionModel =
        bundle.schemaVersion === 3 ? scenario.executionModel : "legacy-tests";
      return executionModel === "journey"
        ? ({
            ...scenario,
            executionModel,
            steps: cloneValue(scenario.steps || []),
            stepOrder: [...(scenario.stepOrder || [])],
          } as WorkflowBundleScenario)
        : {
            ...scenario,
            executionModel: "legacy-tests",
            tests: cloneValue(scenario.tests),
            testOrder: [...scenario.testOrder],
            steps: [],
            stepOrder: [],
          };
    }),
  };
}

function sanitizeEdgesForBundle(edges: FlowEdge[]): FlowEdge[] {
  return normalizeEdges(cloneValue(edges)).map((edge) => ({
    ...edge,
    data: edge.data
      ? {
          relation: edge.data.relation,
          readiness: edge.data.readiness,
          label: edge.data.label,
          description: edge.data.description,
          protocol: edge.data.protocol,
          needsReview: edge.data.needsReview,
        }
      : edge.data,
  }));
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

function validateLegacyBundleScenario(
  scenario: Partial<WorkflowBundleScenario>,
  index: number,
  requireExplicitModel: boolean,
) {
  if (!scenario || typeof scenario !== "object") {
    throw new Error(`Scenario ${index + 1} must be an object.`);
  }

  if (!scenario.name?.trim()) {
    throw new Error(`Scenario ${index + 1} must include a name.`);
  }

  if (requireExplicitModel && scenario.executionModel !== "legacy-tests") {
    throw new Error(
      `Scenario "${scenario.name}" must declare executionModel "legacy-tests".`,
    );
  }

  if (
    scenario.environment !== undefined ||
    scenario.steps !== undefined ||
    scenario.stepOrder !== undefined
  ) {
    throw new Error(
      `Legacy scenario "${scenario.name}" must not include journey fields.`,
    );
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

  for (const test of scenario.tests) {
    const policy = test.retryPolicy;
    if (!policy) continue;
    if (policy.mode !== "transient" && policy.mode !== "never") {
      throw new Error(`Test "${test.name}" has an invalid retry mode.`);
    }
    if (policy.mode === "never" && policy.idempotencyConfirmed) {
      throw new Error(
        `Test "${test.name}" cannot confirm idempotency when retries are disabled.`,
      );
    }
    if (test.type === "delay" && policy.idempotencyConfirmed) {
      throw new Error(`Delay test "${test.name}" cannot enable retries.`);
    }
  }
}

function validateJourneyBundleScenario(
  scenario: Partial<WorkflowBundleScenario>,
  index: number,
  services: Array<{ name: string; ports?: string[] }>,
) {
  if (!scenario.name?.trim()) {
    throw new Error(`Scenario ${index + 1} must include a name.`);
  }
  if (scenario.executionModel !== "journey") {
    throw new Error(
      `Scenario "${scenario.name}" must declare executionModel "journey".`,
    );
  }
  if ("tests" in scenario || "testOrder" in scenario) {
    throw new Error(
      `Journey scenario "${scenario.name}" must not include tests or testOrder.`,
    );
  }
  const environment = scenario.environment;
  if (
    environment?.driver !== "browser" ||
    !environment.browser.targetService.trim() ||
    !environment.browser.targetPort.trim()
  ) {
    throw new Error(
      `Journey scenario "${scenario.name}" must include a browser target service and port.`,
    );
  }
  const target = services.find(
    (service) => service.name === environment.browser.targetService,
  );
  if (!target) {
    throw new Error(
      `Journey scenario "${scenario.name}" references unknown browser target service "${environment.browser.targetService}".`,
    );
  }
  if (
    !target.ports?.some(
      (mapping) => mapping.split(":").at(-1) === environment.browser.targetPort,
    )
  ) {
    throw new Error(
      `Journey scenario "${scenario.name}" browser target does not expose port "${environment.browser.targetPort}".`,
    );
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error(
      `Journey scenario "${scenario.name}" must include at least one step.`,
    );
  }
  if (!Array.isArray(scenario.stepOrder)) {
    throw new Error(
      `Journey scenario "${scenario.name}" must include a stepOrder array.`,
    );
  }
  const stepIds = scenario.steps.map((step) => step.id);
  if (new Set(stepIds).size !== stepIds.length) {
    throw new Error(
      `Journey scenario "${scenario.name}" contains duplicate step ids.`,
    );
  }
  if (
    scenario.stepOrder.length !== stepIds.length ||
    new Set(scenario.stepOrder).size !== scenario.stepOrder.length ||
    scenario.stepOrder.some((stepId) => !stepIds.includes(stepId))
  ) {
    throw new Error(
      `Journey scenario "${scenario.name}" stepOrder must include every step exactly once.`,
    );
  }
  scenario.steps.forEach((step) => validateScenarioStep(step, scenario.name!));
}

function validateScenarioStep(step: ScenarioStep, scenarioName: string) {
  if (!step.id.trim() || !step.name.trim()) {
    throw new Error(
      `Journey scenario "${scenarioName}" contains a step without an id or name.`,
    );
  }
  if (step.timeoutMs !== undefined && step.timeoutMs < 0) {
    throw new Error(`Journey step "${step.name}" has an invalid timeout.`);
  }
  const config =
    step.kind === "action"
      ? step.action
      : step.kind === "assertion"
        ? step.assertion
        : step.control;
  if ("path" in config && !config.path.startsWith("/")) {
    throw new Error(
      `Journey step "${step.name}" path must start with a slash.`,
    );
  }
  if ("locator" in config) {
    const locator = config.locator;
    const valid =
      locator.strategy === "role"
        ? Boolean(locator.role.trim() && locator.name.trim())
        : Boolean(locator.value.trim());
    if (!valid) {
      throw new Error(`Journey step "${step.name}" has an invalid locator.`);
    }
  }
  if (
    step.kind === "action" &&
    step.action.operation === "fill" &&
    step.action.value.source === "run-secret" &&
    !step.action.value.secretRef.trim()
  ) {
    throw new Error(
      `Journey step "${step.name}" run-secret value requires secretRef.`,
    );
  }
  if (
    step.kind === "control" &&
    (step.control.operation !== "delay" || step.control.durationMs < 0)
  ) {
    throw new Error(`Journey step "${step.name}" has an invalid delay.`);
  }
}

function cloneScenarioForImport(
  scenario: WorkflowBundleScenario,
): WorkflowBundleScenario {
  if (scenario.executionModel === "journey") {
    const idMap = new Map<string, string>();
    for (const step of scenario.steps || []) {
      idMap.set(step.id, generateId());
    }
    return {
      name: scenario.name,
      description: scenario.description || "",
      executionModel: "journey",
      environment: cloneValue(scenario.environment),
      steps: (scenario.steps || []).map((step) => ({
        ...cloneValue(step),
        id: idMap.get(step.id) || generateId(),
      })),
      stepOrder: (scenario.stepOrder || [])
        .map((id) => idMap.get(id))
        .filter((id): id is string => Boolean(id)),
    } as WorkflowBundleScenario;
  }
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
    executionModel: "legacy-tests",
    tests,
    testOrder: scenario.testOrder
      .map((id) => idMap.get(id))
      .filter((id): id is string => Boolean(id)),
    steps: [],
    stepOrder: [],
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
        mockServer: cloneValue(node.data.service.mockServer),
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
