"use client";

import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultTest } from "../lib/workflow-defaults";
import type {
  FlowNode,
  JsonValue,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";
import { ContextHelp } from "./BuilderHelp";
import { DraftJsonTextarea, DraftNumberInput } from "./DraftFields";
import { ServiceSelector } from "./ServiceSelector";

interface TestConfigFormProps {
  tests: ScenarioTestDefinition[];
  availableServices: string[];
  serviceNodes?: FlowNode[];
  onChange: (tests: ScenarioTestDefinition[]) => void;
}

type DelayUnit = "ms" | "sec" | "min";

function inferQueueBrokerType(serviceName?: string): "kafka" | "rabbitmq" {
  const lower = (serviceName || "").toLowerCase();
  if (lower.includes("rabbitmq") || lower.includes("rabbit")) {
    return "rabbitmq";
  }
  return "kafka";
}

function parseEnvLines(value: string): Record<string, string> {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const index = line.indexOf("=");
        if (index === -1) {
          return [line, ""];
        }
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
      .filter(([key]) => key),
  );
}

function formatEnvLines(value?: Record<string, string>) {
  if (!value) {
    return "";
  }
  return Object.entries(value)
    .map(([key, entry]) => `${key}=${entry}`)
    .join("\n");
}

function parsePrimitiveList(value: string): Array<string | number | boolean> {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parsePrimitive);
}

function parsePrimitive(value: string): string | number | boolean {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function parseScalarValue(value: string): string | number {
  if (value === "") {
    return "";
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? value : parsed;
}

function parseScalarList(value: string): Array<string | number> {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map(parseScalarValue);
}

function parseJSONObject(value: string): Record<string, JsonValue> | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as JsonValue;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, JsonValue>;
    }
  } catch {}

  return undefined;
}

function parseJSONValue(value: string): JsonValue | undefined {
  if (!value.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(value) as JsonValue;
  } catch {
    return undefined;
  }
}

function parseColumnRules(value: string):
  | {
      [column: string]: {
        value?: string | number;
        in?: (string | number)[];
        contains?: string;
      };
    }
  | undefined {
  const parsed = parseJSONObject(value);
  if (!parsed) {
    return undefined;
  }

  const result: {
    [column: string]: {
      value?: string | number;
      in?: (string | number)[];
      contains?: string;
    };
  } = {};

  for (const [column, rawRules] of Object.entries(parsed)) {
    if (!rawRules || typeof rawRules !== "object" || Array.isArray(rawRules)) {
      continue;
    }
    const rules = rawRules as Record<string, JsonValue>;
    result[column] = {};

    if (typeof rules.value === "string" || typeof rules.value === "number") {
      result[column].value = rules.value;
    }
    if (Array.isArray(rules.in)) {
      result[column].in = rules.in.filter(
        (item): item is string | number =>
          typeof item === "string" || typeof item === "number",
      );
    }
    if (typeof rules.contains === "string") {
      result[column].contains = rules.contains;
    }
  }

  return result;
}

function inferDelayUnit(durationMs: number): DelayUnit {
  if (durationMs >= 60_000 && durationMs % 60_000 === 0) {
    return "min";
  }
  if (durationMs >= 1_000 && durationMs % 1_000 === 0) {
    return "sec";
  }
  return "ms";
}

function convertDurationToUnit(durationMs: number, unit: DelayUnit): number {
  switch (unit) {
    case "min":
      return durationMs / 60_000;
    case "sec":
      return durationMs / 1_000;
    case "ms":
    default:
      return durationMs;
  }
}

function convertUnitToDuration(value: number, unit: DelayUnit): number {
  switch (unit) {
    case "min":
      return value * 60_000;
    case "sec":
      return value * 1_000;
    case "ms":
    default:
      return value;
  }
}

function withTypeDefaults(
  test: ScenarioTestDefinition,
  type: ScenarioTestDefinition["type"],
  serviceNodes: FlowNode[],
  availableServices: string[],
): ScenarioTestDefinition {
  const defaults = createDefaultTest(
    type,
    serviceNodes,
    availableServices,
    test.id,
  );
  return {
    ...defaults,
    name: test.name,
    dependsOnTestIds: test.dependsOnTestIds,
  };
}

export function withPrimaryService(
  test: ScenarioTestDefinition,
  service: string,
): ScenarioTestDefinition {
  const next = { ...test, targetServices: service ? [service] : [] };
  switch (test.type) {
    case "cache":
      return {
        ...next,
        cacheConfig: {
          ...(test.cacheConfig ?? {
            cacheType: "redis",
            operation: "ping",
          }),
          service,
        },
      };
    case "document":
      return {
        ...next,
        documentConfig: {
          ...(test.documentConfig ?? {
            database: "testdb",
            collection: "",
            operation: "find_one",
          }),
          service,
        },
      };
    case "queue":
      return {
        ...next,
        queueConfig: {
          ...(test.queueConfig ?? {
            operation: "produce",
          }),
          service,
          brokerType: inferQueueBrokerType(service),
        },
      };
    default:
      return next;
  }
}

export const TestConfigForm = ({
  tests,
  availableServices,
  serviceNodes = [],
  onChange,
}: TestConfigFormProps) => {
  const [localTests, setLocalTests] = useState<ScenarioTestDefinition[]>(tests);
  const [delayUnits, setDelayUnits] = useState<Record<string, DelayUnit>>({});

  useEffect(() => {
    setLocalTests(tests);
  }, [tests]);

  useEffect(() => {
    setDelayUnits((current) => {
      const next: Record<string, DelayUnit> = {};

      for (const test of tests) {
        if (test.type !== "delay") {
          continue;
        }

        const durationMs = test.delayConfig?.durationMs ?? 1000;
        next[test.id] = current[test.id] ?? inferDelayUnit(durationMs);
      }

      return next;
    });
  }, [tests]);

  const updateTests = (next: ScenarioTestDefinition[]) => {
    setLocalTests(next);
    onChange(next);
  };

  const updateTest = (
    testId: string,
    updater: (test: ScenarioTestDefinition) => ScenarioTestDefinition,
  ) => {
    updateTests(
      localTests.map((test) => (test.id === testId ? updater(test) : test)),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-foreground/90 uppercase">
            Test Definitions
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure tests that will be executed for this scenario
          </p>
        </div>
        <Button
          onClick={() =>
            updateTests([
              ...localTests,
              createDefaultTest("http", serviceNodes, availableServices),
            ])
          }
          className="shadow-sm"
        >
          <IconPlus className="mr-2 size-4" />
          Add Test
        </Button>
      </div>

      {localTests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 rounded-xl border border-dashed border-border/60 bg-muted/20">
          <div className="p-3 rounded-full bg-muted/50 mb-3">
            <IconPlus className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium text-foreground/80 mb-1">
            No tests defined
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Add your first test to get started
          </p>
          <Button
            onClick={() =>
              updateTests([
                ...localTests,
                createDefaultTest("http", serviceNodes, availableServices),
              ])
            }
            size="sm"
            className="shadow-sm"
          >
            <IconPlus className="mr-2 size-4" />
            Add First Test
          </Button>
        </div>
      ) : (
        localTests.map((test, index) => (
          <div
            key={test.id}
            className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden"
          >
            <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-semibold text-sm">
                  #{index + 1}
                </div>
                <h4 className="font-semibold text-base">
                  {test.name || "Untitled Test"}
                </h4>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() =>
                  updateTests(
                    localTests.filter((candidate) => candidate.id !== test.id),
                  )
                }
                className="shadow-sm"
              >
                <IconTrash className="mr-2 size-4" />
                Remove
              </Button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <Label
                  htmlFor={`test-name-${test.id}`}
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Test Name
                </Label>
                <Input
                  id={`test-name-${test.id}`}
                  value={test.name}
                  onChange={(event) =>
                    updateTest(test.id, (current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="shadow-sm mt-1.5"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Test Type
                    </Label>
                    <ContextHelp label="test type">
                      Choose the executor that matches the behavior you need to
                      prove: HTTP, database, document, shell, cache, queue, or a
                      deliberate delay.
                    </ContextHelp>
                  </div>
                  <Select
                    value={test.type}
                    onValueChange={(value) =>
                      updateTest(test.id, (current) =>
                        withTypeDefaults(
                          {
                            ...current,
                            type: value as ScenarioTestDefinition["type"],
                          },
                          value as ScenarioTestDefinition["type"],
                          serviceNodes,
                          availableServices,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="shadow-sm mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="http">Call an API</SelectItem>
                      <SelectItem value="database">Query a database</SelectItem>
                      <SelectItem value="document">Check a document</SelectItem>
                      <SelectItem value="shell">
                        Run an advanced command
                      </SelectItem>
                      <SelectItem value="cache">Check cached data</SelectItem>
                      <SelectItem value="queue">Check a message</SelectItem>
                      <SelectItem value="delay">Wait for something</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="flex items-center gap-1">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Target Service
                    </Label>
                    <ContextHelp label="target service">
                      The target is the workflow service this test talks to.
                      Tokyo Tester resolves it by its network alias inside the
                      isolated run.
                    </ContextHelp>
                  </div>
                  <div className="mt-1.5">
                    <ServiceSelector
                      value={test.targetServices[0] || ""}
                      services={availableServices}
                      disabled={test.type === "delay"}
                      invalid={
                        test.type !== "delay" &&
                        (!test.targetServices[0] ||
                          !availableServices.includes(test.targetServices[0]))
                      }
                      onValueChange={(service) =>
                        updateTest(test.id, (current) =>
                          withPrimaryService(current, service),
                        )
                      }
                    />
                  </div>
                  {test.type === "delay" ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Delay steps do not target a service. They pause the
                      scenario before the next test runs.
                    </p>
                  ) : availableServices.length > 0 ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Available:{" "}
                      <code className="text-xs bg-muted px-1 py-0.5 rounded">
                        {availableServices.join(", ")}
                      </code>
                    </p>
                  ) : null}
                </div>
              </div>

              <Separator />

              {test.type === "http" && (
                <div className="space-y-4 pt-2">
                  <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                    HTTP Configuration
                  </h5>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Method
                      </Label>
                      <Select
                        value={test.httpConfig?.method || "GET"}
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: value as NonNullable<
                                ScenarioTestDefinition["httpConfig"]
                              >["method"],
                              path: current.httpConfig?.path ?? "/",
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: current.httpConfig?.expectedBody,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {["GET", "POST", "PUT", "DELETE", "PATCH"].map(
                            (method) => (
                              <SelectItem key={method} value={method}>
                                {method}
                              </SelectItem>
                            ),
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label
                        htmlFor={`http-path-${test.id}`}
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        Path
                      </Label>
                      <Input
                        id={`http-path-${test.id}`}
                        value={test.httpConfig?.path ?? "/"}
                        className="shadow-sm mt-1.5 font-mono text-sm"
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: event.target.value,
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: current.httpConfig?.expectedBody,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label
                        htmlFor={`http-port-${test.id}`}
                        className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                      >
                        Port
                      </Label>
                      <Input
                        id={`http-port-${test.id}`}
                        value={test.httpConfig?.port ?? "80"}
                        className="shadow-sm mt-1.5"
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: current.httpConfig?.path ?? "/",
                              port: event.target.value,
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: current.httpConfig?.expectedBody,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`http-headers-${test.id}`}>
                      Headers JSON
                    </Label>
                    <DraftJsonTextarea
                      id={`http-headers-${test.id}`}
                      value={test.httpConfig?.headers}
                      parse={(draft) =>
                        parseJSONObject(draft) as
                          | Record<string, string>
                          | undefined
                      }
                      placeholder={`{\n  "Content-Type": "application/json"\n}`}
                      onValueChange={(headers) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path ?? "/",
                            port: current.httpConfig?.port ?? "80",
                            headers,
                            body: current.httpConfig?.body,
                            expectedStatus:
                              current.httpConfig?.expectedStatus ?? 200,
                            expectedBody: current.httpConfig?.expectedBody,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor={`http-body-${test.id}`}>Body</Label>
                    <Textarea
                      id={`http-body-${test.id}`}
                      value={test.httpConfig?.body || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path ?? "/",
                            port: current.httpConfig?.port ?? "80",
                            headers: current.httpConfig?.headers,
                            body: event.target.value,
                            expectedStatus:
                              current.httpConfig?.expectedStatus ?? 200,
                            expectedBody: current.httpConfig?.expectedBody,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`http-expected-status-${test.id}`}>
                        Expected Status
                      </Label>
                      <DraftNumberInput
                        id={`http-expected-status-${test.id}`}
                        min={100}
                        max={599}
                        value={test.httpConfig?.expectedStatus ?? 200}
                        onValueChange={(expectedStatus) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: current.httpConfig?.path ?? "/",
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus,
                              expectedBody: current.httpConfig?.expectedBody,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <div className="flex items-center gap-1">
                        <Label htmlFor={`http-expected-body-mode-${test.id}`}>
                          Expected Body Mode
                        </Label>
                        <ContextHelp label="expected HTTP body mode">
                          “Contains text” looks for a fragment. “JSON partial”
                          checks only the fields you provide and ignores
                          harmless extra fields.
                        </ContextHelp>
                      </div>
                      <Select
                        value={
                          test.httpConfig?.expectedBody?.mode || "contains"
                        }
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: current.httpConfig?.path ?? "/",
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: {
                                mode: value as "contains" | "json_partial",
                                value: value === "json_partial" ? {} : "",
                              },
                            },
                          }))
                        }
                      >
                        <SelectTrigger
                          id={`http-expected-body-mode-${test.id}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contains">
                            Contains text
                          </SelectItem>
                          <SelectItem value="json_partial">
                            JSON partial
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {test.httpConfig?.expectedBody?.mode === "json_partial" ? (
                    <div>
                      <Label htmlFor={`http-expected-body-json-${test.id}`}>
                        Expected Body JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`http-expected-body-json-${test.id}`}
                        value={
                          typeof test.httpConfig.expectedBody.value ===
                            "object" &&
                          test.httpConfig.expectedBody.value !== null &&
                          !Array.isArray(test.httpConfig.expectedBody.value)
                            ? test.httpConfig.expectedBody.value
                            : undefined
                        }
                        parse={parseJSONObject}
                        placeholder={`{\n  "status": "ok"\n}`}
                        onValueChange={(expectedBody) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: current.httpConfig?.path ?? "/",
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: {
                                mode: "json_partial",
                                value: expectedBody ?? {},
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  ) : (
                    <div>
                      <Label htmlFor={`http-expected-body-text-${test.id}`}>
                        Expected Body Contains
                      </Label>
                      <Input
                        id={`http-expected-body-text-${test.id}`}
                        value={
                          typeof test.httpConfig?.expectedBody?.value ===
                          "string"
                            ? test.httpConfig.expectedBody.value
                            : ""
                        }
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            httpConfig: {
                              method: current.httpConfig?.method || "GET",
                              path: current.httpConfig?.path ?? "/",
                              port: current.httpConfig?.port ?? "80",
                              headers: current.httpConfig?.headers,
                              body: current.httpConfig?.body,
                              expectedStatus:
                                current.httpConfig?.expectedStatus ?? 200,
                              expectedBody: {
                                mode: "contains",
                                value: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              )}

              {test.type === "database" && (
                <div className="space-y-4 pt-2">
                  <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                    Database Configuration
                  </h5>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <Label>Driver</Label>
                      <Select
                        value={test.databaseConfig?.driver || "postgres"}
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              driver: value as NonNullable<
                                ScenarioTestDefinition["databaseConfig"]
                              >["driver"],
                              database: current.databaseConfig?.database || "",
                              user: current.databaseConfig?.user || "",
                              password: current.databaseConfig?.password || "",
                              query: current.databaseConfig?.query || "",
                              expectedResult:
                                current.databaseConfig?.expectedResult,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="postgres">Postgres</SelectItem>
                          <SelectItem value="mysql">MySQL</SelectItem>
                          <SelectItem value="mariadb">MariaDB</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor={`database-name-${test.id}`}>
                        Database
                      </Label>
                      <Input
                        id={`database-name-${test.id}`}
                        value={test.databaseConfig?.database || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              driver:
                                current.databaseConfig?.driver || "postgres",
                              database: event.target.value,
                              user: current.databaseConfig?.user || "",
                              password: current.databaseConfig?.password || "",
                              query: current.databaseConfig?.query || "",
                              expectedResult:
                                current.databaseConfig?.expectedResult,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`database-user-${test.id}`}>User</Label>
                      <Input
                        id={`database-user-${test.id}`}
                        value={test.databaseConfig?.user || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              driver:
                                current.databaseConfig?.driver || "postgres",
                              database: current.databaseConfig?.database || "",
                              user: event.target.value,
                              password: current.databaseConfig?.password || "",
                              query: current.databaseConfig?.query || "",
                              expectedResult:
                                current.databaseConfig?.expectedResult,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`database-password-${test.id}`}>
                        Password
                      </Label>
                      <Input
                        id={`database-password-${test.id}`}
                        type="password"
                        value={test.databaseConfig?.password || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              driver:
                                current.databaseConfig?.driver || "postgres",
                              database: current.databaseConfig?.database || "",
                              user: current.databaseConfig?.user || "",
                              password: event.target.value,
                              query: current.databaseConfig?.query || "",
                              expectedResult:
                                current.databaseConfig?.expectedResult,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor={`database-query-${test.id}`}>Query</Label>
                    <Textarea
                      id={`database-query-${test.id}`}
                      value={test.databaseConfig?.query || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          databaseConfig: {
                            driver:
                              current.databaseConfig?.driver || "postgres",
                            database: current.databaseConfig?.database || "",
                            user: current.databaseConfig?.user || "",
                            password: current.databaseConfig?.password || "",
                            query: event.target.value,
                            expectedResult:
                              current.databaseConfig?.expectedResult,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="flex items-center gap-1">
                        <Label>Expected Result Mode</Label>
                        <ContextHelp label="expected database result mode">
                          Choose whether the query should return any rows, one
                          exact scalar, a value list, or structured row and
                          column constraints.
                        </ContextHelp>
                      </div>
                      <Select
                        value={
                          typeof test.databaseConfig?.expectedResult ===
                            "object" &&
                          test.databaseConfig.expectedResult &&
                          "mode" in test.databaseConfig.expectedResult
                            ? String(test.databaseConfig.expectedResult.mode)
                            : "rows"
                        }
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              driver:
                                current.databaseConfig?.driver || "postgres",
                              database: current.databaseConfig?.database || "",
                              user: current.databaseConfig?.user || "",
                              password: current.databaseConfig?.password || "",
                              query: current.databaseConfig?.query || "",
                              expectedResult:
                                value === "rows"
                                  ? { mode: "rows", value: true }
                                  : value === "single"
                                    ? { mode: "single", value: "" }
                                    : value === "list"
                                      ? { mode: "list", value: [] }
                                      : {
                                          mode: "structured",
                                          min_rows: 1,
                                        },
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="rows">Rows exist</SelectItem>
                          <SelectItem value="single">Single value</SelectItem>
                          <SelectItem value="list">Value list</SelectItem>
                          <SelectItem value="structured">Structured</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {typeof test.databaseConfig?.expectedResult === "object" &&
                  test.databaseConfig.expectedResult &&
                  "mode" in test.databaseConfig.expectedResult &&
                  test.databaseConfig.expectedResult.mode === "rows" ? (
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={Boolean(
                          test.databaseConfig.expectedResult.value,
                        )}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                mode: "rows",
                                value: event.target.checked,
                              },
                            },
                          }))
                        }
                      />
                      <span className="text-sm">Expect rows to exist</span>
                    </div>
                  ) : null}

                  {typeof test.databaseConfig?.expectedResult === "object" &&
                  test.databaseConfig.expectedResult &&
                  "mode" in test.databaseConfig.expectedResult &&
                  test.databaseConfig.expectedResult.mode === "single" ? (
                    <div>
                      <Label htmlFor={`database-single-value-${test.id}`}>
                        Expected Single Value
                      </Label>
                      <Input
                        id={`database-single-value-${test.id}`}
                        value={String(
                          test.databaseConfig.expectedResult.value ?? "",
                        )}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                mode: "single",
                                value: parseScalarValue(event.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  {typeof test.databaseConfig?.expectedResult === "object" &&
                  test.databaseConfig.expectedResult &&
                  "mode" in test.databaseConfig.expectedResult &&
                  test.databaseConfig.expectedResult.mode === "list" ? (
                    <div>
                      <Label htmlFor={`database-values-${test.id}`}>
                        Expected Values
                      </Label>
                      <Input
                        id={`database-values-${test.id}`}
                        value={(
                          test.databaseConfig.expectedResult.value || []
                        ).join(", ")}
                        placeholder="1, hello, true"
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                mode: "list",
                                value: parseScalarList(event.target.value),
                              },
                            },
                          }))
                        }
                      />
                    </div>
                  ) : null}

                  {typeof test.databaseConfig?.expectedResult === "object" &&
                  test.databaseConfig.expectedResult &&
                  "mode" in test.databaseConfig.expectedResult &&
                  test.databaseConfig.expectedResult.mode === "structured" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor={`database-min-rows-${test.id}`}>
                          Minimum Rows
                        </Label>
                        <DraftNumberInput
                          id={`database-min-rows-${test.id}`}
                          min={0}
                          value={
                            test.databaseConfig.expectedResult.min_rows ?? 1
                          }
                          onValueChange={(minRows) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              databaseConfig: {
                                ...current.databaseConfig!,
                                expectedResult: {
                                  ...current.databaseConfig!.expectedResult,
                                  mode: "structured",
                                  min_rows: minRows,
                                },
                              },
                            }))
                          }
                        />
                      </div>

                      <div>
                        <Label htmlFor={`database-max-rows-${test.id}`}>
                          Maximum Rows
                        </Label>
                        <DraftNumberInput
                          id={`database-max-rows-${test.id}`}
                          min={0}
                          value={
                            test.databaseConfig.expectedResult.max_rows ?? 0
                          }
                          onValueChange={(maxRows) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              databaseConfig: {
                                ...current.databaseConfig!,
                                expectedResult: {
                                  ...current.databaseConfig!.expectedResult,
                                  mode: "structured",
                                  max_rows: maxRows,
                                },
                              },
                            }))
                          }
                        />
                      </div>

                      <div className="md:col-span-2">
                        <Label htmlFor={`database-column-rules-${test.id}`}>
                          Column Rules JSON
                        </Label>
                        <DraftJsonTextarea
                          id={`database-column-rules-${test.id}`}
                          value={test.databaseConfig.expectedResult.columns}
                          parse={parseColumnRules}
                          placeholder={`{\n  "status": { "value": "ready" }\n}`}
                          onValueChange={(columns) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              databaseConfig: {
                                ...current.databaseConfig!,
                                expectedResult: {
                                  ...current.databaseConfig!.expectedResult,
                                  mode: "structured",
                                  columns: columns ?? {},
                                },
                              },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              )}

              {test.type === "document" && (
                <div className="space-y-4 pt-2">
                  <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                    Document Configuration
                  </h5>
                  <div className="grid gap-3 md:grid-cols-4">
                    <div>
                      <Label>Service</Label>
                      <ServiceSelector
                        value={
                          test.documentConfig?.service ||
                          test.targetServices[0] ||
                          ""
                        }
                        services={availableServices}
                        onValueChange={(service) =>
                          updateTest(test.id, (current) =>
                            withPrimaryService(current, service),
                          )
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`document-database-${test.id}`}>
                        Database
                      </Label>
                      <Input
                        id={`document-database-${test.id}`}
                        value={test.documentConfig?.database ?? "testdb"}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              service:
                                current.documentConfig?.service ||
                                current.targetServices[0] ||
                                "",
                              database: event.target.value,
                              collection:
                                current.documentConfig?.collection || "",
                              operation:
                                current.documentConfig?.operation || "find_one",
                              document: current.documentConfig?.document,
                              filter: current.documentConfig?.filter,
                              update: current.documentConfig?.update,
                              expectedDocument:
                                current.documentConfig?.expectedDocument,
                              expectedDocuments:
                                current.documentConfig?.expectedDocuments,
                              expectedCount:
                                current.documentConfig?.expectedCount,
                              expectedExists:
                                current.documentConfig?.expectedExists,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`document-collection-${test.id}`}>
                        Collection
                      </Label>
                      <Input
                        id={`document-collection-${test.id}`}
                        value={test.documentConfig?.collection || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              service:
                                current.documentConfig?.service ||
                                current.targetServices[0] ||
                                "",
                              database:
                                current.documentConfig?.database ?? "testdb",
                              collection: event.target.value,
                              operation:
                                current.documentConfig?.operation || "find_one",
                              document: current.documentConfig?.document,
                              filter: current.documentConfig?.filter,
                              update: current.documentConfig?.update,
                              expectedDocument:
                                current.documentConfig?.expectedDocument,
                              expectedDocuments:
                                current.documentConfig?.expectedDocuments,
                              expectedCount:
                                current.documentConfig?.expectedCount,
                              expectedExists:
                                current.documentConfig?.expectedExists,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Operation</Label>
                      <Select
                        value={test.documentConfig?.operation || "find_one"}
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              service:
                                current.documentConfig?.service ||
                                current.targetServices[0] ||
                                "",
                              database:
                                current.documentConfig?.database ?? "testdb",
                              collection:
                                current.documentConfig?.collection || "",
                              operation: value as NonNullable<
                                ScenarioTestDefinition["documentConfig"]
                              >["operation"],
                              document: current.documentConfig?.document,
                              filter: current.documentConfig?.filter,
                              update: current.documentConfig?.update,
                              expectedDocument:
                                current.documentConfig?.expectedDocument,
                              expectedDocuments:
                                current.documentConfig?.expectedDocuments,
                              expectedCount:
                                current.documentConfig?.expectedCount,
                              expectedExists:
                                current.documentConfig?.expectedExists,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="insert_one">Insert one</SelectItem>
                          <SelectItem value="find_one">Find one</SelectItem>
                          <SelectItem value="find_many">Find many</SelectItem>
                          <SelectItem value="update_one">Update one</SelectItem>
                          <SelectItem value="delete_one">Delete one</SelectItem>
                          <SelectItem value="count_documents">
                            Count documents
                          </SelectItem>
                          <SelectItem value="exists">Exists</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {["insert_one"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div>
                      <Label htmlFor={`document-payload-${test.id}`}>
                        Document JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`document-payload-${test.id}`}
                        value={test.documentConfig?.document}
                        parse={parseJSONObject}
                        placeholder={`{\n  "name": "Alice"\n}`}
                        onValueChange={(document) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              document,
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {[
                    "find_one",
                    "find_many",
                    "update_one",
                    "delete_one",
                    "count_documents",
                    "exists",
                  ].includes(test.documentConfig?.operation || "") && (
                    <div>
                      <Label htmlFor={`document-filter-${test.id}`}>
                        Filter JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`document-filter-${test.id}`}
                        value={test.documentConfig?.filter}
                        parse={parseJSONObject}
                        placeholder={`{\n  "email": "alice@example.com"\n}`}
                        onValueChange={(filter) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              filter,
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {["update_one"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div>
                      <Label htmlFor={`document-update-${test.id}`}>
                        Update JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`document-update-${test.id}`}
                        value={test.documentConfig?.update}
                        parse={parseJSONObject}
                        placeholder={`{\n  "$set": { "role": "admin" }\n}`}
                        onValueChange={(update) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              update,
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {["find_one"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div>
                      <Label htmlFor={`document-expected-${test.id}`}>
                        Expected Document JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`document-expected-${test.id}`}
                        value={test.documentConfig?.expectedDocument}
                        parse={parseJSONObject}
                        placeholder={`{\n  "name": "Alice"\n}`}
                        onValueChange={(expectedDocument) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              expectedDocument,
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {["find_many"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div>
                      <Label htmlFor={`documents-expected-${test.id}`}>
                        Expected Documents JSON
                      </Label>
                      <DraftJsonTextarea
                        id={`documents-expected-${test.id}`}
                        value={test.documentConfig?.expectedDocuments}
                        parse={(draft) => {
                          const parsed = parseJSONValue(draft);
                          return Array.isArray(parsed)
                            ? (parsed.filter(
                                (entry): entry is Record<string, JsonValue> =>
                                  Boolean(entry) &&
                                  typeof entry === "object" &&
                                  !Array.isArray(entry),
                              ) as Record<string, JsonValue>[])
                            : undefined;
                        }}
                        placeholder={`[\n  { "email": "alice@example.com" }\n]`}
                        onValueChange={(expectedDocuments) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              expectedDocuments: expectedDocuments ?? [],
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {["count_documents"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div>
                      <Label htmlFor={`document-expected-count-${test.id}`}>
                        Expected Count
                      </Label>
                      <DraftNumberInput
                        id={`document-expected-count-${test.id}`}
                        min={0}
                        value={test.documentConfig?.expectedCount ?? 0}
                        onValueChange={(expectedCount) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              expectedCount,
                            },
                          }))
                        }
                      />
                    </div>
                  )}

                  {["exists"].includes(
                    test.documentConfig?.operation || "",
                  ) && (
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={test.documentConfig?.expectedExists ?? true}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            documentConfig: {
                              ...current.documentConfig!,
                              expectedExists: event.target.checked,
                            },
                          }))
                        }
                      />
                      <span className="text-sm">Expected to exist</span>
                    </div>
                  )}
                </div>
              )}

              {test.type === "shell" && (
                <div className="space-y-4 pt-2">
                  <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                    Shell Configuration
                  </h5>
                  <div>
                    <Label htmlFor={`shell-command-${test.id}`}>Command</Label>
                    <Textarea
                      id={`shell-command-${test.id}`}
                      value={test.shellConfig?.command || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          shellConfig: {
                            command: event.target.value,
                            env: current.shellConfig?.env ?? {},
                            expectedOutput:
                              current.shellConfig?.expectedOutput || "",
                            expectedExitCode:
                              current.shellConfig?.expectedExitCode ?? 0,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label htmlFor={`shell-environment-${test.id}`}>
                      Environment Variables
                    </Label>
                    <Textarea
                      id={`shell-environment-${test.id}`}
                      value={formatEnvLines(test.shellConfig?.env)}
                      placeholder={"API_URL=${service.host}\nTOKEN=secret"}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          shellConfig: {
                            command: current.shellConfig?.command || "",
                            env: parseEnvLines(event.target.value),
                            expectedOutput:
                              current.shellConfig?.expectedOutput || "",
                            expectedExitCode:
                              current.shellConfig?.expectedExitCode ?? 0,
                          },
                        }))
                      }
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label htmlFor={`shell-output-${test.id}`}>
                        Expected Output Contains
                      </Label>
                      <Input
                        id={`shell-output-${test.id}`}
                        value={test.shellConfig?.expectedOutput || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            shellConfig: {
                              command: current.shellConfig?.command || "",
                              env: current.shellConfig?.env ?? {},
                              expectedOutput: event.target.value,
                              expectedExitCode:
                                current.shellConfig?.expectedExitCode ?? 0,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`shell-exit-code-${test.id}`}>
                        Expected Exit Code
                      </Label>
                      <DraftNumberInput
                        id={`shell-exit-code-${test.id}`}
                        value={test.shellConfig?.expectedExitCode ?? 0}
                        onValueChange={(expectedExitCode) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            shellConfig: {
                              command: current.shellConfig?.command || "",
                              env: current.shellConfig?.env ?? {},
                              expectedOutput:
                                current.shellConfig?.expectedOutput || "",
                              expectedExitCode,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {test.type === "cache" && (
                <div className="space-y-4 pt-2">
                  <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                    Cache Configuration
                  </h5>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label>Cache Service</Label>
                      <ServiceSelector
                        value={
                          test.cacheConfig?.service ||
                          test.targetServices[0] ||
                          ""
                        }
                        services={availableServices}
                        onValueChange={(service) =>
                          updateTest(test.id, (current) =>
                            withPrimaryService(current, service),
                          )
                        }
                      />
                    </div>

                    <div>
                      <Label>Cache Type</Label>
                      <Select
                        value={test.cacheConfig?.cacheType || "redis"}
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            cacheConfig: {
                              service:
                                current.cacheConfig?.service ||
                                current.targetServices[0] ||
                                "",
                              cacheType: value as "redis" | "memcached",
                              operation:
                                current.cacheConfig?.operation || "ping",
                              key: current.cacheConfig?.key,
                              value: current.cacheConfig?.value,
                              expectedValue: current.cacheConfig?.expectedValue,
                              expectedExists:
                                current.cacheConfig?.expectedExists,
                              ttl: current.cacheConfig?.ttl,
                              db: current.cacheConfig?.db,
                              password: current.cacheConfig?.password,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="redis">Redis</SelectItem>
                          <SelectItem value="memcached">Memcached</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Operation</Label>
                      <Select
                        value={test.cacheConfig?.operation || "ping"}
                        onValueChange={(value) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            cacheConfig: {
                              service:
                                current.cacheConfig?.service ||
                                current.targetServices[0] ||
                                "",
                              cacheType:
                                current.cacheConfig?.cacheType || "redis",
                              operation: value as NonNullable<
                                ScenarioTestDefinition["cacheConfig"]
                              >["operation"],
                              key: current.cacheConfig?.key,
                              value: current.cacheConfig?.value,
                              expectedValue: current.cacheConfig?.expectedValue,
                              expectedExists:
                                current.cacheConfig?.expectedExists,
                              ttl: current.cacheConfig?.ttl,
                              db: current.cacheConfig?.db,
                              password: current.cacheConfig?.password,
                            },
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ping">Ping</SelectItem>
                          <SelectItem value="set">Set</SelectItem>
                          <SelectItem value="get">Get</SelectItem>
                          <SelectItem value="exists">Exists</SelectItem>
                          <SelectItem value="delete">Delete</SelectItem>
                          <SelectItem value="del">Del</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {(test.cacheConfig?.operation || "ping") !== "ping" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <Label htmlFor={`cache-key-${test.id}`}>Key</Label>
                        <Input
                          id={`cache-key-${test.id}`}
                          value={test.cacheConfig?.key || ""}
                          onChange={(event) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              cacheConfig: {
                                ...current.cacheConfig!,
                                key: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>

                      {["set", "get"].includes(
                        test.cacheConfig?.operation || "",
                      ) && (
                        <div>
                          <Label htmlFor={`cache-value-${test.id}`}>
                            {(test.cacheConfig?.operation || "") === "set"
                              ? "Value"
                              : "Expected Value"}
                          </Label>
                          <Input
                            id={`cache-value-${test.id}`}
                            value={String(
                              (test.cacheConfig?.operation || "") === "set"
                                ? (test.cacheConfig?.value ?? "")
                                : (test.cacheConfig?.expectedValue ?? ""),
                            )}
                            onChange={(event) =>
                              updateTest(test.id, (current) => ({
                                ...current,
                                cacheConfig: {
                                  ...current.cacheConfig!,
                                  value:
                                    (current.cacheConfig?.operation || "") ===
                                    "set"
                                      ? event.target.value
                                      : current.cacheConfig?.value,
                                  expectedValue:
                                    (current.cacheConfig?.operation || "") ===
                                    "get"
                                      ? event.target.value
                                      : current.cacheConfig?.expectedValue,
                                },
                              }))
                            }
                          />
                        </div>
                      )}

                      {(test.cacheConfig?.operation || "") === "exists" && (
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={test.cacheConfig?.expectedExists ?? true}
                            onChange={(event) =>
                              updateTest(test.id, (current) => ({
                                ...current,
                                cacheConfig: {
                                  ...current.cacheConfig!,
                                  expectedExists: event.target.checked,
                                },
                              }))
                            }
                          />
                          <span className="text-sm">Expected to exist</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-3">
                    <div>
                      <Label htmlFor={`cache-ttl-${test.id}`}>
                        TTL (seconds)
                      </Label>
                      <DraftNumberInput
                        id={`cache-ttl-${test.id}`}
                        min={0}
                        value={test.cacheConfig?.ttl ?? 0}
                        onValueChange={(ttl) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            cacheConfig: {
                              ...current.cacheConfig!,
                              ttl,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`cache-db-${test.id}`}>Redis DB</Label>
                      <DraftNumberInput
                        id={`cache-db-${test.id}`}
                        min={0}
                        value={test.cacheConfig?.db ?? 0}
                        onValueChange={(db) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            cacheConfig: {
                              ...current.cacheConfig!,
                              db,
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label htmlFor={`cache-password-${test.id}`}>
                        Redis Password
                      </Label>
                      <Input
                        id={`cache-password-${test.id}`}
                        type="password"
                        value={test.cacheConfig?.password || ""}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            cacheConfig: {
                              ...current.cacheConfig!,
                              password: event.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
              )}

              {test.type === "queue" && (
                <div className="space-y-4 pt-2">
                  {(() => {
                    const brokerType =
                      test.queueConfig?.brokerType ||
                      inferQueueBrokerType(
                        test.queueConfig?.service || test.targetServices[0],
                      );
                    const queueTargetLabel =
                      brokerType === "rabbitmq" ? "Queue" : "Topic";
                    const showPartition =
                      brokerType === "kafka" &&
                      ["produce", "consume", "produce_and_consume"].includes(
                        test.queueConfig?.operation || "",
                      );
                    const showFromBeginning =
                      brokerType === "kafka" &&
                      (test.queueConfig?.operation || "") === "consume";

                    return (
                      <>
                        <h5 className="text-xs font-semibold text-foreground/80 uppercase tracking-wide border-b pb-2">
                          Queue Configuration
                        </h5>
                        <div className="grid gap-3 md:grid-cols-3">
                          <div>
                            <Label>Queue Service</Label>
                            <ServiceSelector
                              value={
                                test.queueConfig?.service ||
                                test.targetServices[0] ||
                                ""
                              }
                              services={availableServices}
                              onValueChange={(service) =>
                                updateTest(test.id, (current) =>
                                  withPrimaryService(current, service),
                                )
                              }
                            />
                          </div>

                          <div>
                            <Label>Broker Type</Label>
                            <Select
                              value={brokerType}
                              onValueChange={(value) =>
                                updateTest(test.id, (current) => ({
                                  ...current,
                                  queueConfig: {
                                    ...current.queueConfig!,
                                    brokerType: value as "kafka" | "rabbitmq",
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="kafka">Kafka</SelectItem>
                                <SelectItem value="rabbitmq">
                                  RabbitMQ
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label>Operation</Label>
                            <Select
                              value={test.queueConfig?.operation || "produce"}
                              onValueChange={(value) =>
                                updateTest(test.id, (current) => ({
                                  ...current,
                                  queueConfig: {
                                    service:
                                      current.queueConfig?.service ||
                                      current.targetServices[0] ||
                                      "",
                                    brokerType:
                                      current.queueConfig?.brokerType ||
                                      inferQueueBrokerType(
                                        current.queueConfig?.service ||
                                          current.targetServices[0],
                                      ),
                                    operation: value as NonNullable<
                                      ScenarioTestDefinition["queueConfig"]
                                    >["operation"],
                                    topic: current.queueConfig?.topic,
                                    message: current.queueConfig?.message,
                                    key: current.queueConfig?.key,
                                    partition:
                                      current.queueConfig?.partition ?? 0,
                                    timeout: current.queueConfig?.timeout ?? 10,
                                    fromBeginning:
                                      current.queueConfig?.fromBeginning ??
                                      false,
                                    expectedCount:
                                      current.queueConfig?.expectedCount ?? 1,
                                    expectedMessage:
                                      current.queueConfig?.expectedMessage,
                                    expectedExists:
                                      current.queueConfig?.expectedExists ??
                                      true,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="produce">Produce</SelectItem>
                                <SelectItem value="consume">Consume</SelectItem>
                                <SelectItem value="produce_and_consume">
                                  Produce and consume
                                </SelectItem>
                                <SelectItem value="check_topic">
                                  Check topic
                                </SelectItem>
                                <SelectItem value="list_topics">
                                  List topics
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {(test.queueConfig?.operation || "produce") !==
                          "list_topics" && (
                          <div className="grid gap-3 md:grid-cols-2">
                            <div>
                              <Label htmlFor={`queue-target-${test.id}`}>
                                {queueTargetLabel}
                              </Label>
                              <Input
                                id={`queue-target-${test.id}`}
                                value={test.queueConfig?.topic || ""}
                                onChange={(event) =>
                                  updateTest(test.id, (current) => ({
                                    ...current,
                                    queueConfig: {
                                      ...current.queueConfig!,
                                      topic: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>

                            {["produce", "produce_and_consume"].includes(
                              test.queueConfig?.operation || "",
                            ) && (
                              <div>
                                <Label htmlFor={`queue-message-${test.id}`}>
                                  Message
                                </Label>
                                <Input
                                  id={`queue-message-${test.id}`}
                                  value={String(
                                    test.queueConfig?.message ?? "",
                                  )}
                                  onChange={(event) =>
                                    updateTest(test.id, (current) => ({
                                      ...current,
                                      queueConfig: {
                                        ...current.queueConfig!,
                                        message: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            )}

                            {["produce", "produce_and_consume"].includes(
                              test.queueConfig?.operation || "",
                            ) && (
                              <div>
                                <Label htmlFor={`queue-key-${test.id}`}>
                                  Key
                                </Label>
                                <Input
                                  id={`queue-key-${test.id}`}
                                  value={test.queueConfig?.key || ""}
                                  onChange={(event) =>
                                    updateTest(test.id, (current) => ({
                                      ...current,
                                      queueConfig: {
                                        ...current.queueConfig!,
                                        key: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            )}

                            {showPartition && (
                              <div>
                                <Label htmlFor={`queue-partition-${test.id}`}>
                                  Partition
                                </Label>
                                <DraftNumberInput
                                  id={`queue-partition-${test.id}`}
                                  min={0}
                                  value={test.queueConfig?.partition ?? 0}
                                  onValueChange={(partition) =>
                                    updateTest(test.id, (current) => ({
                                      ...current,
                                      queueConfig: {
                                        ...current.queueConfig!,
                                        partition,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            )}

                            {["consume", "produce_and_consume"].includes(
                              test.queueConfig?.operation || "",
                            ) && (
                              <div>
                                <Label htmlFor={`queue-timeout-${test.id}`}>
                                  Timeout (seconds)
                                </Label>
                                <DraftNumberInput
                                  id={`queue-timeout-${test.id}`}
                                  min={1}
                                  value={test.queueConfig?.timeout ?? 10}
                                  onValueChange={(timeout) =>
                                    updateTest(test.id, (current) => ({
                                      ...current,
                                      queueConfig: {
                                        ...current.queueConfig!,
                                        timeout,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            )}

                            {showFromBeginning && (
                              <>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={
                                      test.queueConfig?.fromBeginning ?? false
                                    }
                                    onChange={(event) =>
                                      updateTest(test.id, (current) => ({
                                        ...current,
                                        queueConfig: {
                                          ...current.queueConfig!,
                                          fromBeginning: event.target.checked,
                                        },
                                      }))
                                    }
                                  />
                                  <span className="text-sm">
                                    Read from beginning
                                  </span>
                                </div>

                                <div>
                                  <Label
                                    htmlFor={`queue-expected-count-${test.id}`}
                                  >
                                    Expected Count
                                  </Label>
                                  <DraftNumberInput
                                    id={`queue-expected-count-${test.id}`}
                                    min={1}
                                    value={test.queueConfig?.expectedCount ?? 1}
                                    onValueChange={(expectedCount) =>
                                      updateTest(test.id, (current) => ({
                                        ...current,
                                        queueConfig: {
                                          ...current.queueConfig!,
                                          expectedCount,
                                        },
                                      }))
                                    }
                                  />
                                </div>

                                <div className="md:col-span-2">
                                  <Label
                                    htmlFor={`queue-expected-message-${test.id}`}
                                  >
                                    Expected Message
                                  </Label>
                                  <Input
                                    id={`queue-expected-message-${test.id}`}
                                    value={String(
                                      test.queueConfig?.expectedMessage ?? "",
                                    )}
                                    onChange={(event) =>
                                      updateTest(test.id, (current) => ({
                                        ...current,
                                        queueConfig: {
                                          ...current.queueConfig!,
                                          expectedMessage: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                </div>
                              </>
                            )}

                            {(test.queueConfig?.operation || "") ===
                              "check_topic" && (
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={
                                    test.queueConfig?.expectedExists ?? true
                                  }
                                  onChange={(event) =>
                                    updateTest(test.id, (current) => ({
                                      ...current,
                                      queueConfig: {
                                        ...current.queueConfig!,
                                        expectedExists: event.target.checked,
                                      },
                                    }))
                                  }
                                />
                                <span className="text-sm">
                                  Expected to exist
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {test.type === "delay" && (
                <div className="space-y-4 pt-2">
                  <h5 className="border-b pb-2 text-xs font-semibold uppercase tracking-wide text-foreground/80">
                    Delay Configuration
                  </h5>
                  <div className="grid gap-3 md:max-w-xl md:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                      <Label htmlFor={`delay-duration-${test.id}`}>
                        Delay Duration
                      </Label>
                      <DraftNumberInput
                        id={`delay-duration-${test.id}`}
                        min={delayUnits[test.id] === "ms" ? 100 : 1}
                        step={delayUnits[test.id] === "ms" ? 100 : 1}
                        value={convertDurationToUnit(
                          test.delayConfig?.durationMs ?? 1000,
                          delayUnits[test.id] ??
                            inferDelayUnit(
                              test.delayConfig?.durationMs ?? 1000,
                            ),
                        )}
                        onValueChange={(nextValue) =>
                          updateTest(test.id, (current) => {
                            const unit =
                              delayUnits[test.id] ??
                              inferDelayUnit(
                                current.delayConfig?.durationMs ?? 1000,
                              );
                            return {
                              ...current,
                              delayConfig: {
                                durationMs: Math.max(
                                  100,
                                  convertUnitToDuration(nextValue, unit),
                                ),
                              },
                            };
                          })
                        }
                      />
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Use this when a scenario needs an intentional pause
                        before the next test step.
                      </p>
                    </div>
                    <div>
                      <Label>Unit</Label>
                      <Select
                        value={
                          delayUnits[test.id] ??
                          inferDelayUnit(test.delayConfig?.durationMs ?? 1000)
                        }
                        onValueChange={(value) =>
                          setDelayUnits((current) => ({
                            ...current,
                            [test.id]: value as DelayUnit,
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ms">Milliseconds</SelectItem>
                          <SelectItem value="sec">Seconds</SelectItem>
                          <SelectItem value="min">Minutes</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Stored internally as milliseconds.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
};
