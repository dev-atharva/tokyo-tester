import type {
  FlowNode,
  ServiceNodeData,
  TestDefination,
} from "../workflow/types/react-flow-cots";

export function createPostgresNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label?: string;
    database?: string;
    user?: string;
    password?: string;
    initScripts?: string[];
    tests?: Array<{
      name: string;
      query: string;
    }>;
  } = {},
): FlowNode {
  const data: ServiceNodeData = {
    label: options.label || "PostgreSQL",
    service: {
      type: "postgres",
      env: [
        { id: "1", key: " POSTGRES_DB", value: options.database || "testdb" },
        { id: "2", key: "POSTGRES_USER", value: options.user || "postgres" },
        {
          id: "3",
          key: "POSTGRES_PASSWORD",
          value: options.password || "postgres",
        },
      ],
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, idx) => ({
      id: `test-${idx}`,
      name: test.name,
      type: "database",
      targetServices: [id],
      databaseConfig: {
        driver: "postgres",
        database: options.database || "testdb",
        user: options.user || "postgres",
        password: options.password || "postgres",
        query: test.query,
      },
    })),
  };

  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}

export function createMySqlNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label?: string;
    database?: string;
    user?: string;
    password?: string;
    initScripts?: string[];
    tests?: Array<{
      name: string;
      query: string;
    }>;
  } = {},
): FlowNode {
  const data: ServiceNodeData = {
    label: options.label || "MySql",
    service: {
      type: "mysql",
      env: [
        { id: "1", key: "MYSQL_DB", value: options.database || "testdb" },
        { id: "2", key: "MYSQL_USER", value: options.user || "root" },
        {
          id: "3",
          key: "MYSQL_PASSWORD",
          value: options.password || "root",
        },
      ],
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, idx) => ({
      id: `test-${idx}`,
      name: test.name,
      type: "database",
      targetServices: [id],
      databaseConfig: {
        driver: "mysql",
        database: options.database || "testdb",
        user: options.user || "root",
        password: options.password || "root",
        query: test.query,
      },
    })),
  };
  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}

export function createMariaDbNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label?: string;
    database?: string;
    user?: string;
    password?: string;
    initScripts?: string[];
    tests?: Array<{
      name: string;
      query: string;
    }>;
  } = {},
): FlowNode {
  const data: ServiceNodeData = {
    label: options.label || "MariaDB",
    service: {
      type: "mariadb",
      env: [
        { id: "1", key: "MARIA_DB", value: options.database || "testdb" },
        { id: "2", key: "MARIA_USER", value: options.user || "root" },
        {
          id: "3",
          key: "MARIA_PASSWORD",
          value: options.password || "root",
        },
      ],
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, idx) => ({
      id: `test-${idx}`,
      name: test.name,
      type: "database",
      targetServices: [id],
      databaseConfig: {
        driver: "mariadb",
        database: options.database || "testdb",
        user: options.user || "root",
        password: options.password || "root",
        query: test.query,
      },
    })),
  };
  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}

export function createRedisNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label?: string;
    password?: string;
    database?: number;
    initScripts?: string[];
    tests?: Array<{
      name: string;
      type: "cache";
      cacheConfig?: {
        operation: "ping" | "set" | "get" | "exists" | "delete" | "del";
        key?: string;
        value?: string | number;
        expectedValue?: string | number;
        expectedExists?: boolean;
        ttl?: number;
        db?: number;
      };
    }>;
  } = {},
): FlowNode {
  const env: Array<{ id: string; key: string; value: string }> = [];

  if (options.password) {
    env.push({
      id: "1",
      key: "REDIS_PASSWORD",
      value: options.password,
    });
  }

  const data: ServiceNodeData = {
    label: options.label || "Redis",
    service: {
      type: "redis",
      image: "redis:7",
      env,
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, idx) => {
      const testDef: TestDefination = {
        id: `test-${idx}`,
        name: test.name,
        type: test.type,
        targetServices: [id],
      };

      if (test.type === "cache" && test.cacheConfig) {
        testDef.cacheConfig = {
          service: id,
          cacheType: "redis",
          operation: test.cacheConfig.operation,
          key: test.cacheConfig.key,
          value: test.cacheConfig.value,
          expectedValue: test.cacheConfig.expectedValue,
          expectedExists: test.cacheConfig.expectedExists,
          ttl: test.cacheConfig.ttl,
          db: test.cacheConfig.db ?? options.database ?? 0,
          password: options.password,
        };
      }

      return testDef;
    }),
  };

  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}

export function createKafkaNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label?: string;
    clusterId?: string;
    initScripts?: string[];
    tests?: Array<{
      name: string;
      type: "queue";
      queueConfig?: {
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
    }>;
  } = {},
): FlowNode {
  const env: Array<{ id: string; key: string; value: string }> = [];

  env.push({
    id: "1",
    key: "CLUSTER_ID",
    value: options.clusterId || "test-cluster",
  });

  const data: ServiceNodeData = {
    label: options.label || "Kafka",
    service: {
      type: "kafka",
      image: "confluentinc/confluent-local:7.5.0",
      env,
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, idx) => {
      const testDef: TestDefination = {
        id: `test-${idx}`,
        name: test.name,
        type: test.type,
        targetServices: [id],
      };
      if (test.type === "queue" && test.queueConfig) {
        testDef.queueConfig = {
          service: id,
          brokerType: "kafka",
          operation: test.queueConfig.operation,
          topic: test.queueConfig.topic,
          message: test.queueConfig.message,
          key: test.queueConfig.key,
          partition: test.queueConfig.partition,
          timeout: test.queueConfig.timeout,
          fromBeginning: test.queueConfig.fromBeginning,
          expectedCount: test.queueConfig.expectedCount,
          expectedMessage: test.queueConfig.expectedMessage,
          expectedExists: test.queueConfig.expectedExists,
        };
      }
      return testDef;
    }),
  };

  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}

export function createGenericServiceNode(
  id: string,
  position: { x: number; y: number },
  options: {
    label: string;
    image: string;
    ports?: Array<{ host: string; container: string }>;
    env?: Record<string, string>;
    command?: string[];
    waitStratergy?: {
      type: "log" | "port" | "exec";
      target?: string;
      timeout?: number;
    };
    initScripts?: string[];
    tests?: Array<{
      name: string;
      type: "http" | "shell";
      httpConfig?: {
        method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
        path: string;
        port: string;
        headers?: Record<string, string>;
        body?: string;
        expectedStatus?: number;
      };
      shellConfig: {
        command: string;
        expectedOutput?: string;
        workdir?: string;
      };
    }>;
  },
): FlowNode {
  const data: ServiceNodeData = {
    label: options.label,
    service: {
      type: "generic",
      image: options.image,
      command: options.command,
      ports: options.ports?.map((port, idx) => ({
        id: `${idx}`,
        hostPort: port.host,
        containerPort: port.container,
      })),
      env: options.env
        ? Object.entries(options.env).map(([key, value], idx) => ({
            id: `${idx}`,
            key,
            value,
          }))
        : [],
      waitStratergy: options.waitStratergy
        ? { enabled: true, ...options.waitStratergy }
        : undefined,
      initScripts: options.initScripts?.map((script, idx) => ({
        id: `${idx}`,
        order: idx,
        script,
      })),
    },
    tests: options.tests?.map((test, index) => {
      const testDef: TestDefination = {
        id: `test-${index}`,
        name: test.name,
        type: test.type,
        targetServices: [id],
      };

      if (test.type === "http" && test.httpConfig) {
        testDef.httpConfig = {
          method: test.httpConfig.method || "GET",
          port: test.httpConfig.port,
          path: test.httpConfig.path,
          headers: test.httpConfig.headers,
          body: test.httpConfig.body,
          expectedStatus: test.httpConfig.expectedStatus || 200,
        };
      } else if (test.type === "shell" && test.shellConfig) {
        testDef.shellConfig = test.shellConfig;
      }

      return testDef;
    }),
  };

  return {
    id,
    type: "serviceNode",
    position,
    data,
  };
}
