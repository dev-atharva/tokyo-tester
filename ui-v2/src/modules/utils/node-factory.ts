import {
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
