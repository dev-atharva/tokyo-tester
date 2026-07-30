import { generateId } from "@/lib/generate-id";
import { sanitizeName } from "@/modules/utils/scenario-translator";
import type {
  FlowNode,
  ScenarioTestDefinition,
  ServiceType,
} from "../types/react-flow-cots";

export type ScenarioRecipeKind =
  | "http-smoke"
  | "redis-round-trip"
  | "database-check"
  | "queue-round-trip";

export interface ScenarioRecipe {
  kind: ScenarioRecipeKind;
  label: string;
  description: string;
  serviceTypes: ServiceType[];
}

export const SCENARIO_RECIPES: ScenarioRecipe[] = [
  {
    kind: "http-smoke",
    label: "API smoke check",
    description:
      "Call an application endpoint and expect a successful response.",
    serviceTypes: ["generic", "nginx", "mockserver"],
  },
  {
    kind: "redis-round-trip",
    label: "Redis round trip",
    description: "Store a run-scoped value and read it back.",
    serviceTypes: ["redis"],
  },
  {
    kind: "database-check",
    label: "Database connection",
    description: "Run a safe query that verifies database access.",
    serviceTypes: ["postgres", "mysql", "mariadb"],
  },
  {
    kind: "queue-round-trip",
    label: "Message round trip",
    description: "Publish a run-scoped message and consume it.",
    serviceTypes: ["kafka", "rabbitmq"],
  },
];

function firstNode(nodes: FlowNode[], types: ServiceType[]) {
  return nodes.find((node) => types.includes(node.data.service.type));
}

export function recipeAvailability(
  recipe: ScenarioRecipe,
  nodes: FlowNode[],
): { available: boolean; reason?: string } {
  if (firstNode(nodes, recipe.serviceTypes)) return { available: true };
  return {
    available: false,
    reason: `Add a ${recipe.serviceTypes.join(" or ")} service first.`,
  };
}

export function createScenarioRecipe(
  kind: ScenarioRecipeKind,
  nodes: FlowNode[],
): ScenarioTestDefinition[] {
  const recipe = SCENARIO_RECIPES.find((candidate) => candidate.kind === kind);
  if (!recipe) throw new Error(`Unknown scenario recipe: ${kind}`);
  const node = firstNode(nodes, recipe.serviceTypes);
  if (!node) throw new Error(recipeAvailability(recipe, nodes).reason);
  const service = sanitizeName(node.data.label);

  switch (kind) {
    case "http-smoke": {
      const port = node.data.service.ports?.[0]?.containerPort || "80";
      const expectation = node.data.service.mockServer?.expectations[0];
      return [
        {
          id: generateId(),
          name: `Check ${node.data.label}`,
          type: "http",
          targetServices: [service],
          httpConfig: {
            method: "GET",
            path: expectation?.request.path ?? "/",
            port,
            expectedStatus: 200,
          },
        },
      ];
    }
    case "redis-round-trip": {
      const key = `tokyo:\${tokyo.run_suffix}:sample`;
      return [
        {
          id: generateId(),
          name: "Store a run-scoped Redis value",
          type: "cache",
          targetServices: [service],
          cacheConfig: {
            service,
            cacheType: "redis",
            operation: "set",
            key,
            value: "hello from Tokyo Tester",
            db: 0,
            ttl: 300,
          },
        },
        {
          id: generateId(),
          name: "Read the Redis value",
          type: "cache",
          targetServices: [service],
          cacheConfig: {
            service,
            cacheType: "redis",
            operation: "get",
            key,
            expectedValue: "hello from Tokyo Tester",
            db: 0,
          },
        },
      ];
    }
    case "database-check": {
      const driver = node.data.service.type as "postgres" | "mysql" | "mariadb";
      return [
        {
          id: generateId(),
          name: `Check ${node.data.label} connection`,
          type: "database",
          targetServices: [service],
          databaseConfig: {
            driver,
            database: "",
            user: "",
            password: "",
            query: "SELECT 1 AS tokyo_ready",
            expectedResult: { mode: "rows", value: true },
          },
        },
      ];
    }
    case "queue-round-trip": {
      const brokerType =
        node.data.service.type === "rabbitmq" ? "rabbitmq" : "kafka";
      return [
        {
          id: generateId(),
          name: "Publish and consume a run-scoped message",
          type: "queue",
          targetServices: [service],
          queueConfig: {
            service,
            brokerType,
            operation: "produce_and_consume",
            topic: `tokyo-\${tokyo.run_suffix}-sample`,
            message: "hello from Tokyo Tester",
            timeout: 10,
            expectedCount: 1,
            expectedMessage: "hello from Tokyo Tester",
          },
        },
      ];
    }
  }
}
