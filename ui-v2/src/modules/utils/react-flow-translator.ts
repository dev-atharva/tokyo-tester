import type {
  FlowEdge,
  FlowNode,
  ScenarioTestDefinition,
  TranslationResult,
  ValidationResult,
} from "../workflow/types/react-flow-cots";
import {
  sanitizeName,
  translateScenarioToExecutionBundle,
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "./scenario-translator";

export interface CustomTestOrder {
  nodeId: string;
  testIds: string[];
}

export function validateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
): ValidationResult {
  return validateWorkflowGraph(nodes, edges);
}

// Legacy helper kept for compatibility while scenarios replace node-local tests.
export function translateReactFlowToCotsConfig(
  nodes: FlowNode[],
  edges: FlowEdge[],
  customTestOrder?: Map<string, string[]>,
  registrySecrets?: Record<
    string,
    {
      url?: string;
      auth_type: "basic" | "token";
      username?: string;
      password?: string;
      token?: string;
    }
  >,
): TranslationResult {
  const tests: ScenarioTestDefinition[] = [];

  for (const node of nodes) {
    for (const test of node.data.tests ?? []) {
      tests.push({
        ...test,
        targetServices:
          test.targetServices?.length > 0
            ? test.targetServices
            : [sanitizeName(node.data.label)],
      });
    }
  }

  const testOrder = customTestOrder
    ? Array.from(customTestOrder.values()).flat()
    : tests.map((test) => test.id);

  const graph = translateWorkflowGraphToServiceGraph(nodes, edges, registrySecrets);
  const scenario = {
    id: "legacy-node-tests",
    name: "Legacy Node Tests",
    tests,
    testOrder,
  };

  const validation = validateScenario(graph, scenario);
  if (!validation.valid) {
    throw new Error(validation.errors.map((error) => error.message).join(", "));
  }

  return translateScenarioToExecutionBundle(graph, scenario);
}

export { sanitizeName };
