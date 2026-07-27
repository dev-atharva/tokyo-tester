import { describe, expect, test } from "bun:test";
import type { FlowNode, ServiceType } from "../types/react-flow-cots";
import {
  createDefaultServiceNode,
  createDefaultTest,
  serviceTypeDefaults,
} from "./workflow-defaults";

describe("workflow defaults", () => {
  test("provides runnable service defaults for every service type", () => {
    const types: ServiceType[] = [
      "generic",
      "postgres",
      "mysql",
      "mariadb",
      "redis",
      "memcached",
      "kafka",
      "rabbitmq",
      "mongodb",
    ];
    for (const type of types) {
      const defaults = serviceTypeDefaults(type);
      expect(defaults.service.ports?.[0]?.containerPort).toBeTruthy();
      expect(defaults.service.waitStratergy).toMatchObject({
        enabled: true,
        type: "port",
      });
    }
    expect(serviceTypeDefaults("generic").service.image).toBe("");
  });

  test("uses application health defaults and its first container port", () => {
    const app = createDefaultServiceNode("api", { x: 0, y: 0 }, "generic");
    app.data.label = "Orders API";
    const port = app.data.service.ports?.[0];
    expect(port).toBeDefined();
    if (port) port.containerPort = "3000";
    const definition = createDefaultTest("http", [app], [], "test");
    expect(definition).toMatchObject({
      targetServices: ["orders_api"],
      httpConfig: {
        method: "GET",
        path: "/health",
        port: "3000",
        expectedStatus: 200,
      },
    });
  });

  test("chooses compatible services and safe connectivity operations", () => {
    const nodes = [
      createDefaultServiceNode("api", { x: 0, y: 0 }, "generic"),
      createDefaultServiceNode("db", { x: 0, y: 0 }, "postgres"),
      createDefaultServiceNode("cache", { x: 0, y: 0 }, "redis"),
      createDefaultServiceNode("queue", { x: 0, y: 0 }, "kafka"),
    ] as FlowNode[];
    expect(
      createDefaultTest("database", nodes).databaseConfig?.query,
    ).toContain("SELECT 1");
    expect(createDefaultTest("cache", nodes).cacheConfig?.operation).toBe(
      "ping",
    );
    expect(createDefaultTest("queue", nodes).queueConfig?.operation).toBe(
      "list_topics",
    );
    expect(createDefaultTest("delay", nodes).delayConfig?.durationMs).toBe(
      1000,
    );
  });
});
