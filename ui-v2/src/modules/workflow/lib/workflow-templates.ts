import type { WorkflowBundle } from "../types/react-flow-cots";

export type WorkflowTemplateId =
  | "nginx-smoke"
  | "mock-api-contract"
  | "postgres-redis-state";

export interface WorkflowTemplate {
  id: WorkflowTemplateId;
  name: string;
  description: string;
  serviceSummary: string;
  bundle: WorkflowBundle;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "nginx-smoke",
    name: "Nginx smoke test",
    description:
      "Start a real Nginx container and verify its default page over HTTP.",
    serviceSummary: "Nginx · HTTP assertion",
    bundle: {
      schemaVersion: 2,
      kind: "cots.workflow-bundle",
      workflow: {
        name: "Nginx Smoke Test",
        description:
          "A minimal workflow that demonstrates provisioning and testing a web service.",
        nodes: [
          {
            id: "nginx-web",
            type: "serviceNode",
            position: { x: 120, y: 100 },
            data: {
              label: "Nginx Web",
              description: "Serves the default Nginx welcome page.",
              service: {
                type: "nginx",
                image: "nginx:1.30.4-alpine",
                ports: [
                  { id: "nginx-http", hostPort: "", containerPort: "80" },
                  { id: "nginx-https", hostPort: "", containerPort: "443" },
                ],
                waitStratergy: {
                  enabled: true,
                  type: "port",
                  target: "80",
                  timeout: 30,
                },
              },
            },
          },
        ],
        edges: [],
      },
      scenarios: [
        {
          name: "Default page is available",
          description: "Calls Nginx and checks its default response.",
          tests: [
            {
              id: "nginx-default-page",
              name: "Nginx returns its welcome page",
              type: "http",
              targetServices: ["nginx_web"],
              httpConfig: {
                method: "GET",
                path: "/",
                port: "80",
                expectedStatus: 200,
                expectedBody: { mode: "contains", value: "Welcome to nginx!" },
              },
            },
          ],
          testOrder: ["nginx-default-page"],
        },
      ],
    },
  },
  {
    id: "mock-api-contract",
    name: "Mock API contract",
    description:
      "Define an endpoint on MockServer, then verify its status and JSON response.",
    serviceSummary: "MockServer · HTTP contract",
    bundle: {
      schemaVersion: 2,
      kind: "cots.workflow-bundle",
      workflow: {
        name: "Mock API Contract",
        description:
          "Shows how service-owned MockServer expectations become runnable HTTP assertions.",
        nodes: [
          {
            id: "mock-api",
            type: "serviceNode",
            position: { x: 120, y: 100 },
            data: {
              label: "Mock API",
              description:
                "Returns a deterministic user response for contract tests.",
              service: {
                type: "mockserver",
                image: "mockserver/mockserver:5.15.0",
                ports: [
                  {
                    id: "mockserver-http",
                    hostPort: "",
                    containerPort: "1080",
                  },
                ],
                waitStratergy: {
                  enabled: true,
                  type: "port",
                  target: "1080",
                  timeout: 45,
                },
                mockServer: {
                  expectations: [
                    {
                      id: "user-by-id",
                      request: { method: "GET", path: "/api/users/42" },
                      response: {
                        statusCode: 200,
                        headers: { "Content-Type": "application/json" },
                        body: '{"id":42,"name":"Tokyo"}',
                      },
                    },
                  ],
                },
              },
            },
          },
        ],
        edges: [],
      },
      scenarios: [
        {
          name: "User contract",
          description:
            "Verifies the endpoint configured on the MockServer service.",
          tests: [
            {
              id: "mock-user-response",
              name: "Mock API returns the configured user",
              type: "http",
              targetServices: ["mock_api"],
              httpConfig: {
                method: "GET",
                path: "/api/users/42",
                port: "1080",
                expectedStatus: 200,
                expectedBody: {
                  mode: "json_partial",
                  value: { id: 42, name: "Tokyo" },
                },
              },
            },
          ],
          testOrder: ["mock-user-response"],
        },
      ],
    },
  },
  {
    id: "postgres-redis-state",
    name: "PostgreSQL + Redis state",
    description:
      "Initialize relational data, exercise a cache, and assert both stores in one scenario.",
    serviceSummary: "PostgreSQL · Redis · 3 assertions",
    bundle: {
      schemaVersion: 2,
      kind: "cots.workflow-bundle",
      workflow: {
        name: "PostgreSQL and Redis State",
        description:
          "Demonstrates database initialization and an ordered cache round trip.",
        nodes: [
          {
            id: "postgres",
            type: "serviceNode",
            position: { x: 40, y: 100 },
            data: {
              label: "Postgres",
              description: "Stores seeded user records.",
              service: {
                type: "postgres",
                image: "postgres:16-alpine",
                env: [
                  { id: "pg-db", key: "POSTGRES_DB", value: "testdb" },
                  { id: "pg-user", key: "POSTGRES_USER", value: "postgres" },
                  {
                    id: "pg-password",
                    key: "POSTGRES_PASSWORD",
                    value: "postgres",
                  },
                ],
                ports: [
                  { id: "postgres-port", hostPort: "", containerPort: "5432" },
                ],
                waitStratergy: {
                  enabled: true,
                  type: "port",
                  target: "5432",
                  timeout: 45,
                },
                initScripts: [
                  {
                    id: "seed-users",
                    order: 1,
                    description: "Create and seed users",
                    script:
                      "CREATE TABLE users (id SERIAL PRIMARY KEY, name TEXT NOT NULL); INSERT INTO users (name) VALUES ('Tokyo'), ('Tester');",
                  },
                ],
              },
            },
          },
          {
            id: "redis",
            type: "serviceNode",
            position: { x: 360, y: 100 },
            data: {
              label: "Redis",
              description: "Stores an ephemeral workflow value.",
              service: {
                type: "redis",
                image: "redis:7-alpine",
                ports: [
                  { id: "redis-port", hostPort: "", containerPort: "6379" },
                ],
                waitStratergy: {
                  enabled: true,
                  type: "port",
                  target: "6379",
                  timeout: 30,
                },
              },
            },
          },
        ],
        edges: [],
      },
      scenarios: [
        {
          name: "Persistent and cached state",
          description:
            "Checks seeded SQL data and a Redis write/read round trip.",
          tests: [
            {
              id: "postgres-users",
              name: "Postgres contains two users",
              type: "database",
              targetServices: ["postgres"],
              databaseConfig: {
                driver: "postgres",
                database: "testdb",
                user: "postgres",
                password: "postgres",
                query: "SELECT COUNT(*) FROM users",
                expectedResult: { mode: "single", value: 2 },
              },
            },
            {
              id: "redis-set",
              name: "Store a value in Redis",
              type: "cache",
              targetServices: ["redis"],
              cacheConfig: {
                service: "redis",
                cacheType: "redis",
                operation: "set",
                key: "tokyo:template:ready",
                value: "yes",
                ttl: 300,
                db: 0,
              },
            },
            {
              id: "redis-get",
              name: "Read the value from Redis",
              type: "cache",
              targetServices: ["redis"],
              dependsOnTestIds: ["redis-set"],
              cacheConfig: {
                service: "redis",
                cacheType: "redis",
                operation: "get",
                key: "tokyo:template:ready",
                expectedValue: "yes",
                db: 0,
              },
            },
          ],
          testOrder: ["postgres-users", "redis-set", "redis-get"],
        },
      ],
    },
  },
];

export function getWorkflowTemplate(id: WorkflowTemplateId) {
  return WORKFLOW_TEMPLATES.find((template) => template.id === id);
}
