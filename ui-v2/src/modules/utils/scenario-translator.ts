import type {
  DependencyGraph,
  FlowEdge,
  FlowNode,
  JsonValue,
  NodeMap,
  Scenario,
  ScenarioTestDefinition,
  ServiceConfig,
  TestConfig,
  TranslationError,
  TranslationResult,
  ValidationResult,
} from "../workflow/types/react-flow-cots";

export interface WorkflowServiceGraph {
  nodeMap: NodeMap;
  serviceDeps: DependencyGraph;
  services: ServiceConfig[];
}

type RegistrySecrets = Record<
  string,
  {
    url?: string;
    auth_type: "basic" | "token";
    username?: string;
    password?: string;
    token?: string;
  }
>;

type HttpExpectedBody =
  | {
      mode: "contains" | "json_partial";
      value: string | Record<string, JsonValue>;
    }
  | undefined;

const infrastructureTypes = new Set([
  "postgres",
  "mysql",
  "mariadb",
  "redis",
  "kafka",
]);

export function validateWorkflowGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
): ValidationResult {
  const errors: TranslationError[] = [];
  const warnings: string[] = [];

  if (nodes.length === 0) {
    errors.push({ message: "Flow must contain at least one node." });
  }

  for (const node of nodes) {
    if (!node.data.label) {
      errors.push({
        nodeId: node.id,
        message: "Node must have a label",
        field: "label",
      });
    }

    if (!node.data.service) {
      errors.push({
        nodeId: node.id,
        message: "Node must have service definition",
        field: "service",
      });
      continue;
    }

    if (node.data.service.type === "generic" && !node.data.service.image) {
      errors.push({
        nodeId: node.id,
        message: "Generic service must specify the docker image",
        field: "service.image",
      });
    }
  }

  const graph = buildServiceDependencies(nodes, edges, buildNodeMap(nodes));
  const cycles = detectCycles(graph);
  if (cycles.length > 0) {
    errors.push({
      message: `Circular dependencies detected: ${cycles.map((cycle) => cycle.join("->")).join(", ")}`,
    });
  }

  for (const node of nodes) {
    const hasOutgoing = edges.some((edge) => edge.source === node.id);
    const hasIncoming = edges.some((edge) => edge.target === node.id);
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

export function validateScenario(
  graph: WorkflowServiceGraph,
  scenario: Pick<Scenario, "id" | "name" | "tests" | "testOrder">,
): ValidationResult {
  const errors: TranslationError[] = [];
  const warnings: string[] = [];
  const testIds = new Set<string>();
  const nodeNames = new Set(graph.services.map((service) => service.name));

  if (!scenario.name.trim()) {
    errors.push({ message: "Scenario must have a name", field: "name" });
  }

  if (scenario.tests.length === 0) {
    errors.push({ message: "Scenario must contain at least one test" });
  }

  for (const test of scenario.tests) {
    if (testIds.has(test.id)) {
      errors.push({
        message: `Duplicate test id in scenario: ${test.id}`,
        field: `tests.${test.id}`,
      });
    }
    testIds.add(test.id);
  }

  for (const test of scenario.tests) {
    if (!test.name.trim()) {
      errors.push({
        message: "Scenario test must have a name",
        field: `tests.${test.id}.name`,
      });
    }

    if (!test.targetServices || test.targetServices.length === 0) {
      errors.push({
        message: `Scenario test "${test.name}" must target at least one service`,
        field: `tests.${test.id}.targetServices`,
      });
      continue;
    }

    for (const serviceName of test.targetServices) {
      if (!nodeNames.has(serviceName)) {
        errors.push({
          message: `Scenario test "${test.name}" references unknown service "${serviceName}"`,
          field: `tests.${test.id}.targetServices`,
        });
      }
    }

    for (const depId of test.dependsOnTestIds ?? []) {
      if (!scenario.tests.some((candidate) => candidate.id === depId)) {
        errors.push({
          message: `Scenario test "${test.name}" depends on missing test "${depId}"`,
          field: `tests.${test.id}.dependsOnTestIds`,
        });
      }
    }
  }

  const ordered = scenario.testOrder.filter((id) =>
    scenario.tests.some((test) => test.id === id),
  );
  if (ordered.length !== scenario.tests.length) {
    warnings.push(
      "Scenario test order does not include every test. Missing tests will run after ordered tests.",
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function translateWorkflowGraphToServiceGraph(
  nodes: FlowNode[],
  edges: FlowEdge[],
  registrySecrets?: RegistrySecrets,
): WorkflowServiceGraph {
  const nodeMap = buildNodeMap(nodes);
  const serviceDeps = buildServiceDependencies(nodes, edges, nodeMap);
  const services = translateServices(nodes, serviceDeps, registrySecrets);

  return {
    nodeMap,
    serviceDeps,
    services,
  };
}

export function translateScenarioToExecutionBundle(
  graph: WorkflowServiceGraph,
  scenario: Pick<Scenario, "id" | "name" | "tests" | "testOrder">,
): TranslationResult {
  const requiredServices = expandScenarioServiceSubset(graph, scenario.tests);
  const services = graph.services.filter((service) =>
    requiredServices.has(service.name),
  );

  const tests = translateScenarioTests(scenario, requiredServices);

  return { services, tests };
}

export function buildNodeMap(nodes: FlowNode[]): NodeMap {
  const nodeMap: NodeMap = new Map();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
  }
  return nodeMap;
}

export function buildServiceDependencies(
  nodes: FlowNode[],
  edges: FlowEdge[],
  nodeMap: NodeMap,
): DependencyGraph {
  const graph = new Map<string, string[]>();
  const nodeTypes = new Map<string, string>();

  for (const node of nodes) {
    const serviceName = sanitizeName(node.data.label);
    graph.set(serviceName, []);
    nodeTypes.set(serviceName, node.data.service.type);
  }

  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) {
      continue;
    }
    const sourceName = sanitizeName(source.data.label);
    const targetName = sanitizeName(target.data.label);
    const sourceType = source.data.service.type
    const targetType = source.data.service.type

    const sourceIsInfra = infrastructureTypes.has(sourceType)
    const targetISInfra = infrastructureTypes.has(targetType)

    if (!sourceIsInfra){
      graph.set(sourceName,[...(graph.get(sourceName) || []),targetName])
    }else if(targetISInfra){
      graph.set(sourceName,[...(graph.get(sourceName),[]),targetName])
    }

    graph.set(sourceName, [...(graph.get(sourceName) || []), targetName]);
  }

  const infrastructureServices = Array.from(nodeTypes.entries())
    .filter(([, type]) => infrastructureTypes.has(type))
    .map(([serviceName]) => serviceName);

  for (const [serviceName, type] of nodeTypes.entries()) {
    if (type !== "generic") {
      continue;
    }

    const explicitDependencies = graph.get(serviceName) || [];
    const mergedDependencies = new Set(explicitDependencies);

    for (const infraService of infrastructureServices) {
      if (infraService !== serviceName) {
        const tempGraph = new Map(graph)
        tempGraph.set(serviceName,Array.from(new Set([...mergedDependencies,infraService])))
        const cycles = detectCycles(tempGraph)
        if (cycles.length === 0){
          mergedDependencies.add(infraService);
        } 
      }
    }

    graph.set(serviceName, Array.from(mergedDependencies));
  }

  return graph;
}

function translateServices(
  nodes: FlowNode[],
  serviceDeps: DependencyGraph,
  registrySecrets?: RegistrySecrets,
): ServiceConfig[] {
  const serviceAliases = buildServiceAliasMap(nodes);

  return nodes
    .map((node) => {
      const { data } = node;
      const serviceName = sanitizeName(data.label);
      const config: ServiceConfig = {
        name: serviceName,
        type: data.service.type,
      };

      if (data.service.type === "generic" && data.service.image) {
        config.image = data.service.image;
      }
      if (data.service.command?.length) {
        config.command = data.service.command.map((command) =>
          normalizeServiceReferences(command, serviceAliases),
        );
      }
      if (data.service.env?.length) {
        config.env = Object.fromEntries(
          data.service.env
            .filter((envVar) => envVar.key.trim())
            .map((envVar) => [
              envVar.key.trim(),
              normalizeServiceReferences(envVar.value, serviceAliases),
            ]),
        );
      }
      if (data.service.ports?.length) {
        config.ports = data.service.ports.map(
          (port) => `${port.hostPort}:${port.containerPort}`,
        );
      }
      if (data.service.waitStratergy?.enabled) {
        config.wait_strategy = {
          type: data.service.waitStratergy.type,
          target: data.service.waitStratergy.target,
          timeout: data.service.waitStratergy.timeout,
        };
      }
      if (data.service.initScripts?.length) {
        config.init_scripts = [...data.service.initScripts]
          .sort((left, right) => left.order - right.order)
          .map((script) =>
            normalizeServiceReferences(script.script, serviceAliases),
          );
      }

      const dependencies = serviceDeps.get(serviceName) || [];
      if (dependencies.length) {
        config.depends_on = dependencies;
      }

      const registry = registrySecrets?.[serviceName];
      if (registry?.url) {
        config.registry = {
          url: registry.url,
          auth_type: registry.auth_type,
          username: registry.username,
          password: registry.password,
          token: registry.token,
        };
      }

      return config;
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function buildServiceAliasMap(nodes: FlowNode[]): Map<string, string> {
  const aliases = new Map<string, string>();

  for (const node of nodes) {
    const sanitized = sanitizeName(node.data.label || node.id);
    const candidates = [
      node.data.label,
      node.id,
      sanitized,
      (node.data.label || "").trim(),
      (node.id || "").trim(),
    ];

    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      aliases.set(candidate, sanitized);
      aliases.set(candidate.toLowerCase(), sanitized);
    }
  }

  return aliases;
}

function normalizeServiceReferences(
  value: string | undefined,
  aliases: Map<string, string>,
): string {
  if (!value) {
    return value ?? "";
  }

  return value.replace(/\$\{([^}]+)\}/g, (match, rawRef: string) => {
    const [serviceToken, ...rest] = rawRef.split(".");
    if (!serviceToken || rest.length === 0) {
      return match;
    }

    const normalizedService =
      aliases.get(serviceToken) ??
      aliases.get(serviceToken.trim()) ??
      aliases.get(serviceToken.toLowerCase()) ??
      sanitizeName(serviceToken);

    return `\${${normalizedService}.${rest.join(".")}}`;
  });
}

function expandScenarioServiceSubset(
  graph: WorkflowServiceGraph,
  tests: ScenarioTestDefinition[],
): Set<string> {
  const required = new Set<string>();

  const visit = (serviceName: string) => {
    if (required.has(serviceName)) {
      return;
    }
    required.add(serviceName);
    for (const dependency of graph.serviceDeps.get(serviceName) || []) {
      visit(dependency);
    }
  };

  for (const test of tests) {
    for (const serviceName of test.targetServices) {
      visit(serviceName);
    }
  }

  return required;
}

function translateScenarioTests(
  scenario: Pick<Scenario, "tests" | "testOrder">,
  requiredServices: Set<string>,
): TestConfig[] {
  const orderedIds = scenario.testOrder.filter((id) =>
    scenario.tests.some((test) => test.id === id),
  );

  const tests = [
    ...orderedIds
      .map((id) => scenario.tests.find((test) => test.id === id))
      .filter((test): test is ScenarioTestDefinition => Boolean(test)),
    ...scenario.tests.filter((test) => !orderedIds.includes(test.id)),
  ];

  return tests.map((test, index) => {
    const defaultService = test.targetServices[0];
    const dependsOn = new Set<string>(test.dependsOnTestIds || []);

    if (index > 0) {
      dependsOn.add(tests[index - 1].name);
    }

    const config = buildTestConfig(test, defaultService, requiredServices);
    return {
      name: test.name,
      type: test.type,
      depends_on: Array.from(dependsOn),
      config,
    };
  });
}

function buildTestConfig(
  test: ScenarioTestDefinition,
  defaultService: string,
  requiredServices: Set<string>,
): Record<string, string | number | boolean | JsonValue> {
  const targetService = requiredServices.has(defaultService)
    ? defaultService
    : Array.from(requiredServices)[0];

  switch (test.type) {
    case "database":
      return {
        service: targetService,
        driver: test.databaseConfig?.driver || "postgres",
        database: test.databaseConfig?.database || "",
        user: test.databaseConfig?.user || "",
        password: test.databaseConfig?.password || "",
        query: test.databaseConfig?.query || "",
        expected_result: test.databaseConfig?.expectedResult ?? null,
      };
    case "http":
      return {
        service: targetService,
        method: test.httpConfig?.method || "GET",
        path: test.httpConfig?.path || "/",
        port: test.httpConfig?.port || "80",
        headers: test.httpConfig?.headers ?? {},
        body: test.httpConfig?.body || "",
        expected_status: test.httpConfig?.expectedStatus ?? 200,
        expected_body: translateExpectedHttpBody(test.httpConfig?.expectedBody),
      };
    case "shell":
      return {
        command: test.shellConfig?.command || "",
        env: test.shellConfig?.env ?? {},
        expected_output: test.shellConfig?.expectedOutput || "",
        expected_exit_code: test.shellConfig?.expectedExitCode ?? 0,
      };
    case "cache":
      return {
        service: test.cacheConfig?.service || targetService,
        cache_type: test.cacheConfig?.cacheType || "redis",
        operation: test.cacheConfig?.operation || "ping",
        key: test.cacheConfig?.key || "",
        value: test.cacheConfig?.value ?? "",
        expected_value: test.cacheConfig?.expectedValue ?? "",
        expected_exists: test.cacheConfig?.expectedExists ?? false,
        ttl: test.cacheConfig?.ttl ?? 0,
        db: test.cacheConfig?.db ?? 0,
        password: test.cacheConfig?.password || "",
      };
    case "queue":
      return {
        service: test.queueConfig?.service || targetService,
        broker_type: test.queueConfig?.brokerType || "kafka",
        operation: test.queueConfig?.operation || "produce",
        topic: test.queueConfig?.topic || "",
        message: test.queueConfig?.message ?? "",
        key: test.queueConfig?.key || "",
        partition: test.queueConfig?.partition ?? 0,
        timeout: test.queueConfig?.timeout ?? 10,
        from_beginning: test.queueConfig?.fromBeginning ?? false,
        expected_count: test.queueConfig?.expectedCount ?? 1,
        expected_message: test.queueConfig?.expectedMessage ?? "",
        expected_exists: test.queueConfig?.expectedExists ?? true,
      };
    case "delay":
      return {
        duration_ms: test.delayConfig?.durationMs ?? 1000,
      };
  }
}

function translateExpectedHttpBody(
  expectedBody: HttpExpectedBody,
): JsonValue {
  if (!expectedBody) {
    return null;
  }

  if (expectedBody.mode === "contains") {
    return typeof expectedBody.value === "string"
      ? expectedBody.value
      : JSON.stringify(expectedBody.value);
  }

  if (typeof expectedBody.value === "string") {
    try {
      return JSON.parse(expectedBody.value) as JsonValue;
    } catch {
      return {};
    }
  }

  return expectedBody.value;
}

function detectCycles(graph: DependencyGraph): string[][] {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const cycles: string[][] = [];

  function dfs(node: string, path: string[]) {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart).concat(node));
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visiting.add(node);
    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      dfs(neighbor, [...path, node]);
    }
    visiting.delete(node);
    visited.add(node);
  }

  for (const node of graph.keys()) {
    dfs(node, []);
  }

  return cycles;
}

export function sanitizeName(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}
