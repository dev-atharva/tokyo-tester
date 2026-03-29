import type { Edge, Node } from "reactflow";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | { [key: string]: JsonValue }
  | JsonValue[];

export interface ServiceConfig {
  name: string;
  type: "postgres" | "mysql" | "generic" | "mariadb" | "redis" | "kafka";
  image?: string;
  command?: string[];
  env?: Record<string, string>;
  ports?: string[];
  depends_on?: string[];
  wait_stratergy?: WaitStratergyConfig;
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
  type: "database" | "http" | "shell" | "cache" | "queue";
  depends_on: string[];
  config: Record<string, JsonValue>;
}

export interface CreateServicesRequest {
  services: ServiceConfig[];
}

export interface CreateServicesResponse {
  session_id: string;
  message: string;
}

export interface RunTestsRequest {
  tests: TestConfig[];
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

// Service node data represents a service with embedded test definations
// Each node contains : Service defination(compulsory) + test defination (optional)
export interface ServiceNodeData {
  label: string;
  description?: string;

  service: {
    type: "postgres" | "mysql" | "mariadb" | "generic" | "redis" | "kafka";

    // generic service fields
    image?: string;
    command?: string[];
    ports?: PortMapping[];

    // Env variables
    env?: EnvironmentVariable[];

    waitStratergy?: {
      enabled: boolean;
      type: "log" | "port" | "exec";
      target?: string;
      timeout?: number;
    };

    initScripts?: InitScript[];
  };

  // Optional test configuration for that node
  tests?: TestDefination[];

  onDelete?: (nodeId: string) => void;
}

export interface TestDefination {
  id: string;
  name: string;
  type: "database" | "http" | "shell" | "cache" | "queue";

  databaseConfig?: {
    driver: "postgres" | "mysql" | "mariadb";
    database: string;
    user: string;
    password: string;
    query: string;
    expectedResult?: ExpectedResult;
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
    expectedOutput?: string;
    workdir?: string;
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
    brokerType: "kafka" | "rabbitmq" | "nats";
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
}

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

//React flow types

//Node data included in the official node type
export type FlowNode = Node<ServiceNodeData>;

// Edge direction respresents data flow
// source -> target : means data is flowing from source to the target
// for services : target depends_on source (basically provision source first)
// for tests : target tests depends_on source tests (run source tests first)

export interface EdgeData {
  label?: string;
  dataFlowType?: "read" | "write" | "bidirectional";
}

export type FlowEdge = Edge<EdgeData>;

// Translation result types
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

// Workflow states (used in the inngest)
export interface WorkflowInput {
  sessionId: string;
  workflowId: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  workflowName: string;
  userId?: string;
  customTestOrder?: [string, string[]][];

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

export interface WorkflowState {
  sessionId?: string;
  servicesCreated: boolean;
  testsExecuted: boolean;
  cleanUp: boolean;
  results?: RunTestsResponse;
  errors?: string[];
}

export interface WorkflowResult {
  success: boolean;
  sessionId: string;
  testResults?: RunTestsResponse;
  errors?: string[];
  duration?: number;
}

export type NodeMap = Map<string, FlowNode>;

export type DependencyGraph = Map<string, string[]>;

export interface ExecutionOrder {
  services: string[];
  tests: string[];
  cycles?: string[][];
}

export interface WorkflowLogEvent {
  sessionId: string;
  message: string;
  status?: "running" | "completed" | "failed";
  timestamp: number;
  sequence: number;
  result?: JsonValue;
  error?: string;
}

export type WorkflowSummary = RunTestsResponse["summary"];
