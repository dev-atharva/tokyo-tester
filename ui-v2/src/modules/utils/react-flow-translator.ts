//Translates the visal flow builder data to COTS backend payload.

import {
  DependencyGraph,
  FlowEdge,
  FlowNode,
  NodeMap,
  ServiceConfig,
  TestConfig,
  TestDefination,
  TranslationError,
  TranslationResult,
  ValidationResult,
} from "../workflow/types/react-flow-cots";
import test from "node:test";

//Edge: source -> target means data flows from sdource to target.
// Service Dependencies : target depends_on source (Revrse of dataflow)
// Test Dependencies : target test depends_on source tests.
//

export interface CustomTestOrder {
  nodeId: string;
  testIds: string[]; // Ordered list of test IDs
}

export function translateReactFlowToCotsConfig(
  nodes: FlowNode[],
  edges: FlowEdge[],
  customTestOrder?: Map<string, string[]>,
): TranslationResult {
  const nodeMap = buildNodeMap(nodes);

  const serviceDeps = buildServiceDependencies(nodes, edges, nodeMap);

  const services = translateServices(nodes, serviceDeps);

  const testDeps = buildTestDependencies(nodes, edges, nodeMap);

  const tests = translateTests(nodes, testDeps, customTestOrder);

  return { services, tests };
}

export function validateFlow(
  nodes: FlowNode[],
  edges: FlowEdge[],
): ValidationResult {
  const errors: TranslationError[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push({ message: "Flow must contain at least one node." });
  }

  for (const node of nodes) {
    const nodeErrors = validateNode(node);
    errors.push(...nodeErrors);
  }

  const serviceDeps = buildServiceDependencies(
    nodes,
    edges,
    buildNodeMap(nodes),
  );

  const cycles = detectCycles(serviceDeps);

  if (cycles.length > 0) {
    errors.push({
      message: `Circular dependencies detected: ${cycles.map((c) => c.join("->")).join(", ")}`,
    });
  }

  for (const node of nodes) {
    const hasOutgoing = edges.some((e) => e.source === node.id);
    const hasIncoming = edges.some((e) => e.target === node.id);
    if (!hasIncoming && !hasOutgoing && nodes.length > 1) {
      warnings.push(`Node "${node.data.label}" has no connections`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateNode(node: FlowNode): TranslationError[] {
  const errors: TranslationError[] = [];

  const { data } = node;
  if (!data.label) {
    errors.push({
      nodeId: node.id,
      message: "Node must have a label",
      field: "label",
    });
  }

  if (!data.service) {
    errors.push({
      nodeId: node.id,
      message: "Node must have service defination",
      field: "service",
    });
    return errors;
  }

  if (data.service.type === "generic" && !data.service.image) {
    errors.push({
      nodeId: node.id,
      message: "Generic service must specify the docker image",
      field: "service.image",
    });
  }

  if (data.service.ports) {
    for (const port of data.service.ports) {
      if (!port.hostPort || !port.containerPort) {
        errors.push({
          nodeId: node.id,
          message: "Port mapping must specify both host and container port",
          field: "service.ports",
        });
      }
    }
  }

  if (data.service.env) {
    for (const envVar of data.service.env) {
      if (!envVar.key) {
        errors.push({
          nodeId: node.id,
          message: "Environment variable must have a key",
          field: "service.env",
        });
      }
    }
  }

  if (data.service.initScripts) {
    const orders = data.service.initScripts.map(
      (s: { order: number }) => s.order,
    );
    if (new Set(orders).size !== orders.length) {
      errors.push({
        nodeId: node.id,
        message: "Init scripst must have unique order values.",
        field: "service.initScripts",
      });
    }
  }

  if (data.tests) {
    for (const test of data.tests) {
      errors.push(...validateTest(node.id, test));
    }
  }

  return errors;
}

function validateTest(
  nodeId: string,
  test: TestDefination,
): TranslationError[] {
  const errors: TranslationError[] = [];

  if (!test.name) {
    errors.push({
      nodeId: nodeId,
      message: "Test must have a name",
      field: `tests.${test.id}.name`,
    });
  }

  if (test.type === "database" && !test.databaseConfig) {
    errors.push({
      nodeId: nodeId,
      message: "Database test must have a database configuration",
      field: `tests.${test.id}.databaseConfig`,
    });
  } else if (test.type === "http" && !test.httpConfig) {
    errors.push({
      nodeId: nodeId,
      message: "Http test must have http confiuration",
      field: `tests.${test.id}.httpConfig`,
    });
  } else if (test.type === "shell" && !test.shellConfig) {
    errors.push({
      nodeId: nodeId,
      message: "Shell test must have shell configuration",
      field: `tests.${test.id}.shellConfig`,
    });
  }

  if (test.type === "database" && test.databaseConfig) {
    if (!test.databaseConfig.query) {
      errors.push({
        nodeId: nodeId,
        message: "Database test must specify a query.",
        field: `tests.${test.id}.databaseConfig.query`,
      });
    }
  }

  if (test.type === "http" && test.httpConfig) {
    if (!test.httpConfig.path) {
      errors.push({
        nodeId: nodeId,
        message: "Http test must have a path configured",
        field: `tests.${test.id}.httpConfig.path`,
      });
    }
  }

  if (test.type === "shell" && test.shellConfig) {
    if (!test.shellConfig.command) {
      errors.push({
        nodeId: nodeId,
        message: "Shell test must have aa commabnd configured",
        field: `tests.${test.id}.shellConfig.command`,
      });
    }
  }

  return errors;
}

function buildServiceDependencies(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeMap: NodeMap,
): DependencyGraph {
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    const serviceName = sanitizeName(node.data.label);
    const outgoingEdges = edges.filter((e) => e.source === node.id);

    const dependencies = outgoingEdges.map((e) => {
      const targetNode = nodeMap.get(e.target);
      return sanitizeName(targetNode!.data.label);
    });
    graph.set(serviceName, dependencies);
  }

  return graph;
}

function translateServices(
  nodes: FlowNode[],
  serviceDeps: DependencyGraph,
): ServiceConfig[] {
  return nodes.map((node) => {
    const { data } = node;
    const serviceName = sanitizeName(data.label);

    const config: ServiceConfig = {
      name: serviceName,
      type: data.service.type,
    };

    if (data.service.type === "generic" && data.service.image) {
      config.image = data.service.image;
    }
    if (data.service.command && data.service.command.length > 0) {
      config.command = data.service.command;
    }
    if (data.service.env && data.service.env.length > 0) {
      config.env = data.service.env.reduce(
        (
          acc: Record<string, string>,
          envVar: { key: string; value: string },
        ) => {
          if (envVar.key) {
            acc[envVar.key] = envVar.value || "";
          }
          return acc;
        },
        {} as Record<string, string>,
      );
    }
    if (data.service.ports && data.service.ports.length > 0) {
      config.ports = data.service.ports
        .filter(
          (p: { hostPort: string; containerPort: string }) =>
            p.hostPort && p.containerPort,
        )
        .map(
          (p: { hostPort: string; containerPort: string }) =>
            `${p.hostPort}:${p.containerPort}`,
        );
    }

    const dependencies = serviceDeps.get(serviceName) || [];
    if (dependencies.length > 0) {
      config.depends_on = dependencies;
    }

    if (data.service.waitStratergy?.enabled) {
      config.wait_stratergy = {
        type: data.service.waitStratergy.type,
        target: data.service.waitStratergy.target,
        timeout: data.service.waitStratergy.timeout,
      };
    }

    if (data.service.initScripts && data.service.initScripts.length > 0) {
      config.init_scripts = data.service.initScripts
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order)
        .map((s: { script: string }) => s.script);
    }

    return config;
  });
}

function buildTestDependencies(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeMap: NodeMap,
): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const node of nodes) {
    const serviceName = sanitizeName(node.data.label);
    const tests = node.data.tests || [];

    for (const test of tests) {
      const testName = `${serviceName}_${sanitizeName(test.name)}`;
      const dependencies: string[] = [serviceName];

      const incomingEdges = edges.filter((e) => e.target === node.id);

      for (const edge of incomingEdges) {
        const sourceNode = nodeMap.get(edge.source);
        if (!sourceNode) {
          continue;
        }

        const sourceServiceName = sanitizeName(sourceNode.data.label);
        const sourceTests = sourceNode.data.tests || [];

        for (const sourceTest of sourceTests) {
          const sourceTestName = `${sourceServiceName}_${sanitizeName(sourceTest.name)}`;
          dependencies.push(sourceTestName);
        }

        dependencies.push(sourceServiceName);
      }

      graph.set(testName, Array.from(new Set(dependencies)));
    }
  }
  return graph;
}

function translateTests(
  nodes: FlowNode[],
  testDeps: Map<string, string[]>,
  customTestOrder?: Map<string, string[]>,
): TestConfig[] {
  const tests: TestConfig[] = [];

  // Map testId -> { node, test }
  const testById = new Map<string, { node: FlowNode; test: TestDefination }>();
  for (const node of nodes) {
    for (const test of node.data.tests ?? []) {
      testById.set(test.id, { node, test });
    }
  }

  const hasCustomOrder = customTestOrder && customTestOrder.size > 0;

  // ─────────────────────────────────────────────────────────────
  // ✅ CUSTOM ORDER PATH (AUTHORITATIVE)
  // ─────────────────────────────────────────────────────────────
  if (hasCustomOrder) {
    console.log("Custom test order received:", customTestOrder);

    // Check if we have a global flat order (new format)
    const globalFlatOrder = customTestOrder!.get("__GLOBAL_ORDER__");

    const globalTestOrder: string[] = globalFlatOrder || [];

    // If no global order, fall back to old method (flatten by iterating Map)
    if (!globalFlatOrder) {
      console.log("No global order found, using legacy grouping");
      for (const [nodeId, testIds] of customTestOrder!.entries()) {
        if (testIds && testIds.length > 0) {
          globalTestOrder.push(...testIds);
        }
      }
    }

    console.log("Global test order from customTestOrder:", globalTestOrder);

    let previousTestName: string | null = null;

    // Process tests in the exact global order
    for (const testId of globalTestOrder) {
      const entry = testById.get(testId);
      if (!entry) {
        console.warn(`Test ${testId} not found in nodes`);
        continue;
      }

      const { node, test } = entry;
      const serviceName = sanitizeName(node.data.label);
      const testName = `${serviceName}_${sanitizeName(test.name)}`;

      const dependsOn = new Set<string>();
      dependsOn.add(serviceName);

      // 🔥 Enforce sequential execution: each test depends on the previous one
      if (previousTestName) {
        dependsOn.add(previousTestName);
      }

      const config: TestConfig = {
        name: testName,
        type: test.type,
        depends_on: Array.from(dependsOn),
        config: {},
      };

      // ---- Config mapping ----
      if (test.type === "database" && test.databaseConfig) {
        config.config = {
          service: serviceName,
          driver: test.databaseConfig.driver,
          database: test.databaseConfig.database,
          user: test.databaseConfig.user,
          password: test.databaseConfig.password,
          query: test.databaseConfig.query,
        };
      } else if (test.type === "http" && test.httpConfig) {
        config.config = {
          service: serviceName,
          method: test.httpConfig.method,
          path: test.httpConfig.path,
          port: test.httpConfig.port,
        };

        if (test.httpConfig.headers) {
          config.config.headers = test.httpConfig.headers;
        }
        if (test.httpConfig.body) {
          config.config.body = test.httpConfig.body;
        }
        if (test.httpConfig.expectedStatus !== undefined) {
          config.config.expected_status = test.httpConfig.expectedStatus;
        }
      } else if (test.type === "shell" && test.shellConfig) {
        config.config = {
          command: test.shellConfig.command,
        };

        if (test.shellConfig.expectedOutput) {
          config.config.expected_status = test.shellConfig.expectedOutput;
        }
        if (test.shellConfig.workdir) {
          config.config.workdir = test.shellConfig.workdir;
        }
      }

      tests.push(config);
      previousTestName = testName;
    }

    console.log(
      "Generated tests with custom order:",
      tests.map((t) => t.name),
    );
    return tests;
  }

  // ─────────────────────────────────────────────────────────────
  // DEFAULT PATH (GRAPH-INFERRED)
  // ─────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const serviceName = sanitizeName(node.data.label);
    for (const test of node.data.tests ?? []) {
      const testName = `${serviceName}_${sanitizeName(test.name)}`;
      const config = buildTestConfig(testName, serviceName, test, testDeps);
      tests.push(config);
    }
  }

  return tests;
}

function buildTestConfig(
  testName: string,
  serviceName: string,
  test: TestDefination,
  testDeps: Map<string, string[]>,
): TestConfig {
  const config: TestConfig = {
    name: testName,
    type: test.type,
    depends_on: testDeps.get(testName) || [serviceName],
    config: {},
  };

  if (test.type === "database" && test.databaseConfig) {
    config.config = {
      service: serviceName,
      driver: test.databaseConfig.driver,
      database: test.databaseConfig.database,
      user: test.databaseConfig.user,
      password: test.databaseConfig.password,
      query: test.databaseConfig.query,
    };
  } else if (test.type === "http" && test.httpConfig) {
    config.config = {
      service: serviceName,
      method: test.httpConfig.method,
      path: test.httpConfig.path,
      port: test.httpConfig.port,
    };

    if (test.httpConfig.headers) {
      config.config.headers = test.httpConfig.headers;
    }
    if (test.httpConfig.body) {
      config.config.body = test.httpConfig.body;
    }
    if (test.httpConfig.expectedStatus != undefined) {
      config.config.expected_status = test.httpConfig.expectedStatus;
    }
  } else if (test.type === "shell" && test.shellConfig) {
    config.config = {
      command: test.shellConfig.command,
    };

    if (test.shellConfig.expectedOutput) {
      config.config.expected_status = test.shellConfig.expectedOutput;
    }
    if (test.shellConfig.workdir) {
      config.config.workdir = test.shellConfig.workdir;
    }
  }

  return config;
}

function buildNodeMap(nodes: FlowNode[]): NodeMap {
  return new Map(nodes.map((node) => [node.id, node]));
}

function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path]);
      } else if (recursionStack.has(neighbor)) {
        const cycleStart = path.indexOf(neighbor);
        cycles.push([...path.slice(cycleStart), neighbor]);
      }
    }
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}

function sanitizeName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function getServiceProvisioningOrder(
  nodes: FlowNode[],
  edges: FlowEdge[],
): string[] {
  const nodeMap = buildNodeMap(nodes);
  const serviceDeps = buildServiceDependencies(nodes, edges, nodeMap);

  const visited = new Set<string>();
  const order: string[] = [];
  function dfs(serviceName: string): void {
    if (visited.has(serviceName)) return;

    visited.add(serviceName);
    const dependencies = serviceDeps.get(serviceName) || [];
    for (const dep of dependencies) {
      dfs(dep);
    }
    order.push(serviceName);
  }

  for (const node of nodes) {
    const serviceName = sanitizeName(node.data.label);
    dfs(serviceName);
  }

  return order;
}

export function getTestExecutionOrder(
  nodes: FlowNode[],
  edges: FlowEdge[],
  customTestOrder?: Map<string, string[]>,
): string[] {
  const nodeMap = buildNodeMap(nodes);
  const testDeps = buildTestDependencies(nodes, edges, nodeMap);

  // If custom order is provided, respect it
  if (customTestOrder && customTestOrder.size > 0) {
    const order: string[] = [];
    const processed = new Set<string>();

    for (const node of nodes) {
      const serviceName = sanitizeName(node.data.label);
      const nodeCustomOrder =
        customTestOrder!.get(node.id) ??
        customTestOrder!.get(sanitizeName(node.data.label));

      if (nodeCustomOrder && nodeCustomOrder.length > 0) {
        for (const testId of nodeCustomOrder) {
          const test = node.data.tests?.find((t) => t.id === testId);
          if (test && !processed.has(testId)) {
            const testName = `${serviceName}_${sanitizeName(test.name)}`;
            order.push(testName);
            processed.add(testId);
          }
        }
      } else {
        // No custom order for this node, use default
        const tests = node.data.tests || [];
        for (const test of tests) {
          if (!processed.has(test.id)) {
            const testName = `${serviceName}_${sanitizeName(test.name)}`;
            order.push(testName);
            processed.add(test.id);
          }
        }
      }
    }

    return order;
  }

  // Default behavior: topological sort
  const visited = new Set<string>();
  const order: string[] = [];

  function dfs(testName: string): void {
    if (visited.has(testName)) return;

    visited.add(testName);
    const dependencies = testDeps.get(testName) || [];
    for (const dep of dependencies) {
      if (testDeps.has(dep)) {
        dfs(dep);
      }
    }
    order.push(testName);
  }

  for (const [testName] of testDeps) {
    dfs(testName);
  }

  return order;
}
