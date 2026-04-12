import type { Edge, Node } from "reactflow";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export type ServiceType =
  | "postgres"
  | "mysql"
  | "generic"
  | "mariadb"
  | "redis"
  | "kafka"
  | "rabbitmq"
  | "mongodb";

export interface ServiceConfig {
  name: string;
  type: ServiceType;
  image?: string;
  command?: string[];
  env?: Record<string, string>;
  ports?: string[];
  depends_on?: string[];
  wait_strategy?: WaitStratergyConfig;
  init_scripts?: string[];
  registry?: RegistryConfig;
}

export interface RegistryConfig {
  url: string;
  auth_type?: "basic" | "token";
  username?: string;
  password?: string;
  token?: string;
}

export interface WaitStratergyConfig {
  type: "log" | "port" | "exec";
  target?: string;
  timeout?: number;
}

export interface TestConfig {
  name: string;
  type:
    | "database"
    | "document"
    | "http"
    | "shell"
    | "cache"
    | "queue"
    | "delay";
  depends_on: string[];
  config: Record<string, JsonValue>;
}

export interface CreateServicesRequest {
  services: ServiceConfig[];
  execution_context?: ExecutionContext;
}

export interface CreateServicesResponse {
  session_id: string;
  message: string;
}

export interface RunTestsRequest {
  tests: TestConfig[];
  execution_context?: ExecutionContext;
}

export interface ExecutionContext {
  session_id?: string;
  project_id?: string;
  user_id?: string;
  client_id?: string;
  workflow_id?: string;
  workflow_run_id?: string;
  scenario_id?: string;
  scenario_name?: string;
}

export interface RunTestsResponse {
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface TestResult {
  name: string;
  passed: boolean;
  type: string;
  message?: string;
  duration?: number;
  output?: JsonValue;
  container_logs?: Record<string, string>;
}

export interface ServiceNodeData {
  label: string;
  description?: string;
  service: {
    type: ServiceType;
    image?: string;
    command?: string[];
    ports?: PortMapping[];
    env?: EnvironmentVariable[];
    waitStratergy?: {
      enabled: boolean;
      type: "log" | "port" | "exec";
      target?: string;
      timeout?: number;
    };
    initScripts?: InitScript[];
  };
  // Kept optional for legacy workflows while scenarios migrate tests out of nodes.
  tests?: ScenarioTestDefinition[];
  onDelete?: (nodeId: string) => void;
}

export interface ScenarioTestDefinition {
  id: string;
  name: string;
  type:
    | "database"
    | "document"
    | "http"
    | "shell"
    | "cache"
    | "queue"
    | "delay";
  targetServices: string[];
  dependsOnTestIds?: string[];
  databaseConfig?: {
    driver: "postgres" | "mysql" | "mariadb";
    database: string;
    user: string;
    password: string;
    query: string;
    expectedResult?: ExpectedResult;
  };
  documentConfig?: {
    service: string;
    database: string;
    collection: string;
    operation:
      | "insert_one"
      | "find_one"
      | "find_many"
      | "update_one"
      | "delete_one"
      | "count_documents"
      | "exists";
    document?: Record<string, JsonValue>;
    filter?: Record<string, JsonValue>;
    update?: Record<string, JsonValue>;
    expectedDocument?: Record<string, JsonValue>;
    expectedDocuments?: Record<string, JsonValue>[];
    expectedCount?: number;
    expectedExists?: boolean;
  };
  httpConfig?: {
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
    path: string;
    port: string;
    headers?: Record<string, string>;
    body?: string;
    expectedStatus?: number;
    expectedBody?: {
      mode: "contains" | "json_partial";
      value: string | Record<string, JsonValue>;
    };
  };
  shellConfig?: {
    command: string;
    env?: Record<string, string>;
    expectedOutput?: string;
    expectedExitCode?: number;
  };
  cacheConfig?: {
    service: string;
    cacheType: "redis" | "memcached";
    operation: "ping" | "set" | "get" | "exists" | "delete" | "del";
    key?: string;
    value?: string | number;
    expectedValue?: string | number;
    expectedExists?: boolean;
    ttl?: number;
    db?: number;
    password?: string;
  };
  queueConfig?: {
    service: string;
    brokerType: "kafka" | "rabbitmq";
    operation:
      | "produce"
      | "consume"
      | "produce_and_consume"
      | "check_topic"
      | "list_topics";
    topic?: string;
    message?: string | number;
    key?: string;
    partition?: number;
    timeout?: number;
    fromBeginning?: boolean;
    expectedCount?: number;
    expectedMessage?: string | number;
    expectedExists?: boolean;
  };
  delayConfig?: {
    durationMs: number;
  };
}

export type TestDefination = ScenarioTestDefinition;

export interface WorkflowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface WorkflowBundleWorkflow {
  name: string;
  description?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface WorkflowBundleScenario {
  name: string;
  description?: string;
  tests: ScenarioTestDefinition[];
  testOrder: string[];
}

export interface WorkflowBundle {
  schemaVersion: number;
  kind: "cots.workflow-bundle";
  workflow: WorkflowBundleWorkflow;
  scenarios: WorkflowBundleScenario[];
}

export interface Scenario {
  id: string;
  projectId: string;
  workflowId: string;
  name: string;
  description?: string;
  tests: ScenarioTestDefinition[];
  testOrder: string[];
  version: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  client_id: string;
  is_deleted: boolean;
}

export type WorkflowRunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial_failed";

export type ScenarioRunStatus = "pending" | "running" | "completed" | "failed";

export interface PortMapping {
  id: string;
  hostPort: string;
  containerPort: string;
}

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
}

export type ExpectedResult =
  | { mode: "rows"; value: boolean }
  | { mode: "single"; value: string | number }
  | { mode: "list"; value: (string | number)[] }
  | {
      mode: "structured";
      min_rows?: number;
      max_rows?: number;
      columns?: {
        [column: string]: {
          value?: string | number;
          in?: (string | number)[];
          contains?: string;
        };
      };
    };

export interface InitScript {
  id: string;
  order: number;
  script: string;
  description?: string;
}

export type FlowNode = Node<ServiceNodeData>;

export interface EdgeData {
  label?: string;
  dataFlowType?: "read" | "write" | "bidirectional";
}

export type FlowEdge = Edge<EdgeData>;

export interface TranslationResult {
  services: ServiceConfig[];
  tests: TestConfig[];
}

export interface TranslationError {
  nodeId?: string;
  edgeId?: string;
  message: string;
  field?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: TranslationError[];
  warnings?: string[];
}

export interface WorkflowRunInput {
  workflowRunId: string;
  projectId: string;
  workflowId: string;
  workflowName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  scenarios: Array<
    Pick<
      Scenario,
      | "id"
      | "name"
      | "description"
      | "tests"
      | "testOrder"
      | "projectId"
      | "user_id"
      | "client_id"
    > & {
      scenarioRunId: string;
    }
  >;
  userId?: string;
  clientId?: string;
  executionOptions?: {
    continueOnFailure?: boolean;
  };
  registrySecrets?: Record<
    string,
    {
      url?: string;
      auth_type: "basic" | "token";
      username?: string;
      password?: string;
      token?: string;
    }
  >;
}

export type WorkflowInput = WorkflowRunInput;

export interface WorkflowState {
  workflowRunId?: string;
  servicesCreated: boolean;
  testsExecuted: boolean;
  cleanUp: boolean;
  results?: RunTestsResponse;
  errors?: string[];
}

export interface WorkflowResult {
  success: boolean;
  workflowRunId: string;
  scenarioResults: ScenarioExecutionResult[];
  summary: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
  };
  errors?: string[];
  duration?: number;
}

export interface ScenarioExecutionResult {
  scenarioId: string;
  scenarioName: string;
  backendSessionId?: string;
  success: boolean;
  status: ScenarioRunStatus;
  testResults?: RunTestsResponse;
  error?: string;
}

export type NodeMap = Map<string, FlowNode>;
export type DependencyGraph = Map<string, string[]>;

export interface ExecutionOrder {
  services: string[];
  tests: string[];
  cycles?: string[][];
}

export interface WorkflowLogEvent {
  workflowRunId: string;
  projectId: string;
  workflowId: string;
  scenarioId?: string;
  scenarioName?: string;
  backendSessionId?: string;
  message: string;
  status?: "running" | "completed" | "failed";
  stage?:
    | "validation"
    | "translation"
    | "provision"
    | "execution"
    | "cleanup"
    | "aggregation";
  timestamp: number;
  sequence: number;
  result?: JsonValue;
  error?: string;
}

export interface ScenarioTestResultEvent {
  workflowRunId: string;
  projectId: string;
  workflowId: string;
  scenarioId: string;
  scenarioName: string;
  backendSessionId?: string;
  bulkId: string;
  timestamp: number;
  results: Array<{
    testResultId: string;
    testName: string;
    testType?: string;
    status: string;
    resultData?: unknown;
    durationMs?: number;
    executedAt?: string;
    action: "create" | "update";
    containerLogs?: Record<string, string>;
    sequence: number;
  }>;
}

export type WorkflowSummary = RunTestsResponse["summary"];
