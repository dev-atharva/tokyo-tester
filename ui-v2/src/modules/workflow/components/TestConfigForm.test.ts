import { describe, expect, test } from "bun:test";
import type { ScenarioTestDefinition } from "../types/react-flow-cots";
import { withPrimaryService } from "./TestConfigForm";

describe("withPrimaryService", () => {
  test("keeps cache target and executor service in sync", () => {
    const testDefinition: ScenarioTestDefinition = {
      id: "cache-test",
      name: "Ping Redis",
      type: "cache",
      targetServices: [],
      cacheConfig: {
        service: "",
        cacheType: "redis",
        operation: "ping",
      },
    };

    const updated = withPrimaryService(testDefinition, "shared_redis");
    expect(updated.targetServices).toEqual(["shared_redis"]);
    expect(updated.cacheConfig?.service).toBe("shared_redis");
  });

  test("updates queue broker inference with the selected service", () => {
    const testDefinition: ScenarioTestDefinition = {
      id: "queue-test",
      name: "Queue check",
      type: "queue",
      targetServices: ["kafka"],
      queueConfig: {
        service: "kafka",
        brokerType: "kafka",
        operation: "produce",
      },
    };

    const updated = withPrimaryService(testDefinition, "rabbitmq_events");
    expect(updated.queueConfig?.service).toBe("rabbitmq_events");
    expect(updated.queueConfig?.brokerType).toBe("rabbitmq");
  });
});
