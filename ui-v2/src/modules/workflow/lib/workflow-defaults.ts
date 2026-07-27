import { generateId } from "@/lib/generate-id";
import { sanitizeName } from "@/modules/utils/scenario-translator";
import type {
  FlowNode,
  ScenarioTestDefinition,
  ServiceNodeData,
  ServiceType,
} from "../types/react-flow-cots";

const labels: Record<ServiceType, string> = {
  generic: "Application",
  postgres: "PostgreSQL",
  mysql: "MySQL",
  mariadb: "MariaDB",
  redis: "Redis",
  memcached: "Memcached",
  kafka: "Kafka",
  rabbitmq: "RabbitMQ",
  mongodb: "MongoDB",
};

const images: Record<ServiceType, string> = {
  generic: "",
  postgres: "postgres:16-alpine",
  mysql: "mysql:8.4",
  mariadb: "mariadb:11",
  redis: "redis:7-alpine",
  memcached: "memcached:1.6-alpine",
  kafka: "confluentinc/confluent-local:7.5.0",
  rabbitmq: "rabbitmq:3.13-management-alpine",
  mongodb: "mongo:7",
};

const ports: Record<ServiceType, string> = {
  generic: "8080",
  postgres: "5432",
  mysql: "3306",
  mariadb: "3306",
  redis: "6379",
  memcached: "11211",
  kafka: "9092",
  rabbitmq: "5672",
  mongodb: "27017",
};

const environmentPresets: Partial<
  Record<ServiceType, Array<{ key: string; value: string }>>
> = {
  postgres: [
    { key: "POSTGRES_DB", value: "testdb" },
    { key: "POSTGRES_USER", value: "postgres" },
    { key: "POSTGRES_PASSWORD", value: "postgres" },
  ],
  mysql: [
    { key: "MYSQL_ROOT_PASSWORD", value: "root" },
    { key: "MYSQL_DATABASE", value: "testdb" },
    { key: "MYSQL_USER", value: "root" },
    { key: "MYSQL_PASSWORD", value: "root" },
  ],
  mariadb: [
    { key: "MARIADB_DATABASE", value: "testdb" },
    { key: "MARIADB_USER", value: "root" },
    { key: "MARIADB_PASSWORD", value: "root" },
    { key: "MARIADB_ROOT_PASSWORD", value: "root" },
  ],
  kafka: [{ key: "CLUSTER_ID", value: "test-cluster" }],
  rabbitmq: [
    { key: "RABBITMQ_DEFAULT_USER", value: "guest" },
    { key: "RABBITMQ_DEFAULT_PASS", value: "guest" },
  ],
  mongodb: [
    { key: "MONGO_INITDB_DATABASE", value: "testdb" },
    { key: "MONGO_INITDB_ROOT_USERNAME", value: "admin" },
    { key: "MONGO_INITDB_ROOT_PASSWORD", value: "admin" },
  ],
};

export function serviceTypeDefaults(type: ServiceType): ServiceNodeData {
  const port = ports[type];
  return {
    label: labels[type],
    service: {
      type,
      image: images[type],
      command: [],
      env: (environmentPresets[type] ?? []).map((entry) => ({
        id: generateId(),
        ...entry,
      })),
      ports: [
        {
          id: generateId(),
          hostPort: port,
          containerPort: port,
        },
      ],
      waitStratergy: {
        enabled: true,
        type: "port",
        target: port,
        timeout: 30,
      },
      initScripts: [],
    },
  };
}

export function createDefaultServiceNode(
  id: string,
  position: { x: number; y: number },
  type: ServiceType,
): FlowNode {
  return {
    id,
    type: "serviceNode",
    position,
    data: serviceTypeDefaults(type),
  };
}

function firstService(nodes: FlowNode[], types: ServiceType[]) {
  return nodes.find((node) => types.includes(node.data.service.type));
}

function environmentValue(
  node: FlowNode | undefined,
  keys: string[],
  fallback: string,
) {
  return (
    node?.data.service.env?.find((entry) => keys.includes(entry.key))?.value ??
    fallback
  );
}

export function createDefaultTest(
  type: ScenarioTestDefinition["type"],
  nodes: FlowNode[],
  fallbackServices: string[] = [],
  id = generateId(),
): ScenarioTestDefinition {
  const fallback = fallbackServices[0] ?? "";
  const targetName = (node?: FlowNode) =>
    node ? sanitizeName(node.data.label) : fallback;

  switch (type) {
    case "http": {
      const node = firstService(nodes, ["generic"]);
      return {
        id,
        name: "Check application health",
        type,
        targetServices: targetName(node) ? [targetName(node)] : [],
        httpConfig: {
          method: "GET",
          path: "/health",
          port: node?.data.service.ports?.[0]?.containerPort || "8080",
          expectedStatus: 200,
        },
      };
    }
    case "database": {
      const node = firstService(nodes, ["postgres", "mysql", "mariadb"]);
      const driver = (node?.data.service.type ?? "postgres") as
        | "postgres"
        | "mysql"
        | "mariadb";
      return {
        id,
        name: "Check database connection",
        type,
        targetServices: targetName(node) ? [targetName(node)] : [],
        databaseConfig: {
          driver,
          database: environmentValue(
            node,
            ["POSTGRES_DB", "MYSQL_DATABASE", "MARIADB_DATABASE"],
            "testdb",
          ),
          user: environmentValue(
            node,
            ["POSTGRES_USER", "MYSQL_USER", "MARIADB_USER"],
            driver === "postgres" ? "postgres" : "root",
          ),
          password: environmentValue(
            node,
            ["POSTGRES_PASSWORD", "MYSQL_PASSWORD", "MARIADB_PASSWORD"],
            driver === "postgres" ? "postgres" : "root",
          ),
          query: "SELECT 1 AS tokyo_ready",
          expectedResult: { mode: "rows", value: true },
        },
      };
    }
    case "document": {
      const node = firstService(nodes, ["mongodb"]);
      const service = targetName(node);
      return {
        id,
        name: "Check document store",
        type,
        targetServices: service ? [service] : [],
        documentConfig: {
          service,
          database: environmentValue(node, ["MONGO_INITDB_DATABASE"], "testdb"),
          collection: "health_checks",
          operation: "exists",
          filter: {},
          expectedExists: true,
        },
      };
    }
    case "cache": {
      const node = firstService(nodes, ["redis", "memcached"]);
      const service = targetName(node);
      return {
        id,
        name: "Check cache connection",
        type,
        targetServices: service ? [service] : [],
        cacheConfig: {
          service,
          cacheType:
            node?.data.service.type === "memcached" ? "memcached" : "redis",
          operation: "ping",
          db: 0,
        },
      };
    }
    case "queue": {
      const node = firstService(nodes, ["kafka", "rabbitmq"]);
      const service = targetName(node);
      return {
        id,
        name: "Check message broker connection",
        type,
        targetServices: service ? [service] : [],
        queueConfig: {
          service,
          brokerType:
            node?.data.service.type === "rabbitmq" ? "rabbitmq" : "kafka",
          operation: "list_topics",
          timeout: 10,
        },
      };
    }
    case "shell": {
      const node = firstService(nodes, ["generic"]);
      return {
        id,
        name: "Run an application command",
        type,
        targetServices: targetName(node) ? [targetName(node)] : [],
        shellConfig: { command: "", expectedExitCode: 0, env: {} },
      };
    }
    case "delay":
      return {
        id,
        name: "Wait for the next step",
        type,
        targetServices: [],
        delayConfig: { durationMs: 1000 },
      };
  }
}
