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
import type {
  JsonValue,
  ScenarioTestDefinition,
} from "../types/react-flow-cots";

interface TestConfigFormProps {
  tests: ScenarioTestDefinition[];
  availableServices: string[];
  onChange: (tests: ScenarioTestDefinition[]) => void;
}

function defaultTest(availableServices: string[]): ScenarioTestDefinition {
  return {
    id: `test-${Date.now()}`,
    name: "New Test",
    type: "http",
    targetServices: availableServices[0] ? [availableServices[0]] : [],
    httpConfig: {
      method: "GET",
      path: "/",
      port: "80",
      expectedStatus: 200,
    },
  };
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

function parseColumnRules(
  value: string,
):
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

    if (
      typeof rules.value === "string" ||
      typeof rules.value === "number"
    ) {
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

function stringifyJSON(value: unknown): string {
  if (!value) {
    return "";
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

function withTypeDefaults(
  test: ScenarioTestDefinition,
  type: ScenarioTestDefinition["type"],
): ScenarioTestDefinition {
  switch (type) {
    case "http":
      return {
        ...test,
        type,
        httpConfig: {
          method: "GET",
          path: "/",
          port: "80",
          expectedStatus: 200,
        },
      };
    case "database":
      return {
        ...test,
        type,
        databaseConfig: {
          driver: "postgres",
          database: "",
          user: "",
          password: "",
          query: "",
        },
      };
    case "shell":
      return {
        ...test,
        type,
        shellConfig: {
          command: "",
          env: {},
          expectedOutput: "",
          expectedExitCode: 0,
        },
      };
    case "cache":
      return {
        ...test,
        type,
        cacheConfig: {
          service: test.targetServices[0] || "",
          cacheType: "redis",
          operation: "ping",
          db: 0,
        },
      };
    case "queue":
      return {
        ...test,
        type,
        queueConfig: {
          service: test.targetServices[0] || "",
          brokerType: "kafka",
          operation: "produce",
          topic: "",
          timeout: 10,
          partition: 0,
          expectedCount: 1,
          expectedExists: true,
        },
      };
  }
}

export const TestConfigForm = ({
  tests,
  availableServices,
  onChange,
}: TestConfigFormProps) => {
  const [localTests, setLocalTests] = useState<ScenarioTestDefinition[]>(tests);

  useEffect(() => {
    setLocalTests(tests);
  }, [tests]);

  const updateTests = (next: ScenarioTestDefinition[]) => {
    setLocalTests(next);
    onChange(next);
  };

  const updateTest = (
    testId: string,
    updater: (test: ScenarioTestDefinition) => ScenarioTestDefinition,
  ) => {
    updateTests(localTests.map((test) => (test.id === testId ? updater(test) : test)));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Scenario Tests</h3>
        <Button onClick={() => updateTests([...localTests, defaultTest(availableServices)])}>
          <IconPlus className="mr-2 size-4" />
          Add Test
        </Button>
      </div>

      {localTests.map((test, index) => (
        <div key={test.id} className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Test #{index + 1}</h4>
            <Button
              variant="destructive"
              size="sm"
              onClick={() =>
                updateTests(localTests.filter((candidate) => candidate.id !== test.id))
              }
            >
              <IconTrash className="mr-1 size-4" />
              Remove
            </Button>
          </div>

          <div className="space-y-3">
            <div>
              <Label>Test Name</Label>
              <Input
                value={test.name}
                onChange={(event) =>
                  updateTest(test.id, (current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label>Test Type</Label>
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
                      ),
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">HTTP</SelectItem>
                    <SelectItem value="database">Database</SelectItem>
                    <SelectItem value="shell">Shell</SelectItem>
                    <SelectItem value="cache">Cache</SelectItem>
                    <SelectItem value="queue">Queue</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Target Services</Label>
                <Input
                  value={test.targetServices.join(", ")}
                  placeholder="service-a, service-b"
                  onChange={(event) =>
                    updateTest(test.id, (current) => ({
                      ...current,
                      targetServices: event.target.value
                        .split(",")
                        .map((value) => value.trim())
                        .filter(Boolean),
                    }))
                  }
                />
                {availableServices.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Available services: {availableServices.join(", ")}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            {test.type === "http" && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Method</Label>
                    <Select
                      value={test.httpConfig?.method || "GET"}
                      onValueChange={(value) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: value as NonNullable<
                              ScenarioTestDefinition["httpConfig"]
                            >["method"],
                            path: current.httpConfig?.path || "/",
                            port: current.httpConfig?.port || "80",
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
                        {["GET", "POST", "PUT", "DELETE", "PATCH"].map((method) => (
                          <SelectItem key={method} value={method}>
                            {method}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Path</Label>
                    <Input
                      value={test.httpConfig?.path || "/"}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: event.target.value,
                            port: current.httpConfig?.port || "80",
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
                    <Label>Port</Label>
                    <Input
                      value={test.httpConfig?.port || "80"}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path || "/",
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
                  <Label>Headers JSON</Label>
                  <Textarea
                    value={stringifyJSON(test.httpConfig?.headers)}
                    placeholder={`{\n  "Content-Type": "application/json"\n}`}
                    onChange={(event) =>
                      updateTest(test.id, (current) => ({
                        ...current,
                        httpConfig: {
                          method: current.httpConfig?.method || "GET",
                          path: current.httpConfig?.path || "/",
                          port: current.httpConfig?.port || "80",
                          headers: parseJSONObject(event.target.value) as
                            | Record<string, string>
                            | undefined,
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
                  <Label>Body</Label>
                  <Textarea
                    value={test.httpConfig?.body || ""}
                    onChange={(event) =>
                      updateTest(test.id, (current) => ({
                        ...current,
                        httpConfig: {
                          method: current.httpConfig?.method || "GET",
                          path: current.httpConfig?.path || "/",
                          port: current.httpConfig?.port || "80",
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
                    <Label>Expected Status</Label>
                    <Input
                      type="number"
                      min={100}
                      max={599}
                      value={test.httpConfig?.expectedStatus ?? 200}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path || "/",
                            port: current.httpConfig?.port || "80",
                            headers: current.httpConfig?.headers,
                            body: current.httpConfig?.body,
                            expectedStatus: Number(event.target.value) || 200,
                            expectedBody: current.httpConfig?.expectedBody,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>Expected Body Mode</Label>
                    <Select
                      value={test.httpConfig?.expectedBody?.mode || "contains"}
                      onValueChange={(value) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path || "/",
                            port: current.httpConfig?.port || "80",
                            headers: current.httpConfig?.headers,
                            body: current.httpConfig?.body,
                            expectedStatus:
                              current.httpConfig?.expectedStatus ?? 200,
                            expectedBody: {
                              mode: value as "contains" | "json_partial",
                              value:
                                value === "json_partial"
                                  ? {}
                                  : "",
                            },
                          },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="contains">Contains text</SelectItem>
                        <SelectItem value="json_partial">JSON partial</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {test.httpConfig?.expectedBody?.mode === "json_partial" ? (
                  <div>
                    <Label>Expected Body JSON</Label>
                    <Textarea
                      value={stringifyJSON(test.httpConfig.expectedBody.value)}
                      placeholder={`{\n  "status": "ok"\n}`}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path || "/",
                            port: current.httpConfig?.port || "80",
                            headers: current.httpConfig?.headers,
                            body: current.httpConfig?.body,
                            expectedStatus:
                              current.httpConfig?.expectedStatus ?? 200,
                            expectedBody: {
                              mode: "json_partial",
                              value: parseJSONObject(event.target.value) ?? {},
                            },
                          },
                        }))
                      }
                    />
                  </div>
                ) : (
                  <div>
                    <Label>Expected Body Contains</Label>
                    <Input
                      value={
                        typeof test.httpConfig?.expectedBody?.value === "string"
                          ? test.httpConfig.expectedBody.value
                          : ""
                      }
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          httpConfig: {
                            method: current.httpConfig?.method || "GET",
                            path: current.httpConfig?.path || "/",
                            port: current.httpConfig?.port || "80",
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
              <div className="space-y-3">
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
                            expectedResult: current.databaseConfig?.expectedResult,
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
                    <Label>Database</Label>
                    <Input
                      value={test.databaseConfig?.database || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          databaseConfig: {
                            driver: current.databaseConfig?.driver || "postgres",
                            database: event.target.value,
                            user: current.databaseConfig?.user || "",
                            password: current.databaseConfig?.password || "",
                            query: current.databaseConfig?.query || "",
                            expectedResult: current.databaseConfig?.expectedResult,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>User</Label>
                    <Input
                      value={test.databaseConfig?.user || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          databaseConfig: {
                            driver: current.databaseConfig?.driver || "postgres",
                            database: current.databaseConfig?.database || "",
                            user: event.target.value,
                            password: current.databaseConfig?.password || "",
                            query: current.databaseConfig?.query || "",
                            expectedResult: current.databaseConfig?.expectedResult,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>Password</Label>
                    <Input
                      type="password"
                      value={test.databaseConfig?.password || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          databaseConfig: {
                            driver: current.databaseConfig?.driver || "postgres",
                            database: current.databaseConfig?.database || "",
                            user: current.databaseConfig?.user || "",
                            password: event.target.value,
                            query: current.databaseConfig?.query || "",
                            expectedResult: current.databaseConfig?.expectedResult,
                          },
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <Label>Query</Label>
                  <Textarea
                    value={test.databaseConfig?.query || ""}
                    onChange={(event) =>
                      updateTest(test.id, (current) => ({
                        ...current,
                        databaseConfig: {
                          driver: current.databaseConfig?.driver || "postgres",
                          database: current.databaseConfig?.database || "",
                          user: current.databaseConfig?.user || "",
                          password: current.databaseConfig?.password || "",
                          query: event.target.value,
                          expectedResult: current.databaseConfig?.expectedResult,
                        },
                      }))
                    }
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Expected Result Mode</Label>
                    <Select
                      value={
                        typeof test.databaseConfig?.expectedResult === "object" &&
                        test.databaseConfig.expectedResult &&
                        "mode" in test.databaseConfig.expectedResult
                          ? String(test.databaseConfig.expectedResult.mode)
                          : "rows"
                      }
                      onValueChange={(value) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          databaseConfig: {
                            driver: current.databaseConfig?.driver || "postgres",
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
                      checked={Boolean(test.databaseConfig.expectedResult.value)}
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
                    <Label>Expected Single Value</Label>
                    <Input
                      value={String(test.databaseConfig.expectedResult.value ?? "")}
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
                    <Label>Expected Values</Label>
                    <Input
                      value={(test.databaseConfig.expectedResult.value || []).join(", ")}
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
                      <Label>Minimum Rows</Label>
                      <Input
                        type="number"
                        min={0}
                        value={test.databaseConfig.expectedResult.min_rows ?? 1}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                ...current.databaseConfig!.expectedResult,
                                mode: "structured",
                                min_rows: Number(event.target.value) || 0,
                              },
                            },
                          }))
                        }
                      />
                    </div>

                    <div>
                      <Label>Maximum Rows</Label>
                      <Input
                        type="number"
                        min={0}
                        value={test.databaseConfig.expectedResult.max_rows ?? 0}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                ...current.databaseConfig!.expectedResult,
                                mode: "structured",
                                max_rows: Number(event.target.value) || 0,
                              },
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="md:col-span-2">
                      <Label>Column Rules JSON</Label>
                      <Textarea
                        value={stringifyJSON(
                          test.databaseConfig.expectedResult.columns,
                        )}
                        placeholder={`{\n  "status": { "value": "ready" }\n}`}
                        onChange={(event) =>
                          updateTest(test.id, (current) => ({
                            ...current,
                            databaseConfig: {
                              ...current.databaseConfig!,
                              expectedResult: {
                                ...current.databaseConfig!.expectedResult,
                                mode: "structured",
                                columns:
                                  parseColumnRules(event.target.value) ?? {},
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

            {test.type === "shell" && (
              <div className="space-y-3">
                <div>
                  <Label>Command</Label>
                  <Textarea
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
                  <Label>Environment Variables</Label>
                  <Textarea
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
                    <Label>Expected Output Contains</Label>
                    <Input
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
                    <Label>Expected Exit Code</Label>
                    <Input
                      type="number"
                      value={test.shellConfig?.expectedExitCode ?? 0}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          shellConfig: {
                            command: current.shellConfig?.command || "",
                            env: current.shellConfig?.env ?? {},
                            expectedOutput:
                              current.shellConfig?.expectedOutput || "",
                            expectedExitCode:
                              Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {test.type === "cache" && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Cache Service</Label>
                    <Input
                      value={test.cacheConfig?.service || test.targetServices[0] || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          cacheConfig: {
                            service: event.target.value,
                            cacheType: current.cacheConfig?.cacheType || "redis",
                            operation: current.cacheConfig?.operation || "ping",
                            key: current.cacheConfig?.key,
                            value: current.cacheConfig?.value,
                            expectedValue: current.cacheConfig?.expectedValue,
                            expectedExists: current.cacheConfig?.expectedExists,
                            ttl: current.cacheConfig?.ttl,
                            db: current.cacheConfig?.db,
                            password: current.cacheConfig?.password,
                          },
                        }))
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
                            operation: current.cacheConfig?.operation || "ping",
                            key: current.cacheConfig?.key,
                            value: current.cacheConfig?.value,
                            expectedValue: current.cacheConfig?.expectedValue,
                            expectedExists: current.cacheConfig?.expectedExists,
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
                            cacheType: current.cacheConfig?.cacheType || "redis",
                            operation: value as NonNullable<
                              ScenarioTestDefinition["cacheConfig"]
                            >["operation"],
                            key: current.cacheConfig?.key,
                            value: current.cacheConfig?.value,
                            expectedValue: current.cacheConfig?.expectedValue,
                            expectedExists: current.cacheConfig?.expectedExists,
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
                      <Label>Key</Label>
                      <Input
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

                    {["set", "get"].includes(test.cacheConfig?.operation || "") && (
                      <div>
                        <Label>
                          {(test.cacheConfig?.operation || "") === "set"
                            ? "Value"
                            : "Expected Value"}
                        </Label>
                        <Input
                          value={String(
                            (test.cacheConfig?.operation || "") === "set"
                              ? test.cacheConfig?.value ?? ""
                              : test.cacheConfig?.expectedValue ?? "",
                          )}
                          onChange={(event) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              cacheConfig: {
                                ...current.cacheConfig!,
                                value:
                                  (current.cacheConfig?.operation || "") === "set"
                                    ? event.target.value
                                    : current.cacheConfig?.value,
                                expectedValue:
                                  (current.cacheConfig?.operation || "") === "get"
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
                    <Label>TTL (seconds)</Label>
                    <Input
                      type="number"
                      min={0}
                      value={test.cacheConfig?.ttl ?? 0}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          cacheConfig: {
                            ...current.cacheConfig!,
                            ttl: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>Redis DB</Label>
                    <Input
                      type="number"
                      min={0}
                      value={test.cacheConfig?.db ?? 0}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          cacheConfig: {
                            ...current.cacheConfig!,
                            db: Number(event.target.value) || 0,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>Redis Password</Label>
                    <Input
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
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-3">
                  <div>
                    <Label>Queue Service</Label>
                    <Input
                      value={test.queueConfig?.service || test.targetServices[0] || ""}
                      onChange={(event) =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          queueConfig: {
                            service: event.target.value,
                            brokerType: "kafka",
                            operation: current.queueConfig?.operation || "produce",
                            topic: current.queueConfig?.topic,
                            message: current.queueConfig?.message,
                            key: current.queueConfig?.key,
                            partition: current.queueConfig?.partition,
                            timeout: current.queueConfig?.timeout,
                            fromBeginning: current.queueConfig?.fromBeginning,
                            expectedCount: current.queueConfig?.expectedCount,
                            expectedMessage: current.queueConfig?.expectedMessage,
                            expectedExists: current.queueConfig?.expectedExists,
                          },
                        }))
                      }
                    />
                  </div>

                  <div>
                    <Label>Broker Type</Label>
                    <Select
                      value={test.queueConfig?.brokerType || "kafka"}
                      onValueChange={() =>
                        updateTest(test.id, (current) => ({
                          ...current,
                          queueConfig: {
                            ...current.queueConfig!,
                            brokerType: "kafka",
                          },
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kafka">Kafka</SelectItem>
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
                            brokerType: "kafka",
                            operation: value as NonNullable<
                              ScenarioTestDefinition["queueConfig"]
                            >["operation"],
                            topic: current.queueConfig?.topic,
                            message: current.queueConfig?.message,
                            key: current.queueConfig?.key,
                            partition: current.queueConfig?.partition ?? 0,
                            timeout: current.queueConfig?.timeout ?? 10,
                            fromBeginning:
                              current.queueConfig?.fromBeginning ?? false,
                            expectedCount:
                              current.queueConfig?.expectedCount ?? 1,
                            expectedMessage:
                              current.queueConfig?.expectedMessage,
                            expectedExists:
                              current.queueConfig?.expectedExists ?? true,
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
                        <SelectItem value="check_topic">Check topic</SelectItem>
                        <SelectItem value="list_topics">List topics</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(test.queueConfig?.operation || "produce") !== "list_topics" && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Topic</Label>
                      <Input
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
                        <Label>Message</Label>
                        <Input
                          value={String(test.queueConfig?.message ?? "")}
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
                        <Label>Key</Label>
                        <Input
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

                    {["produce", "consume", "produce_and_consume"].includes(
                      test.queueConfig?.operation || "",
                    ) && (
                      <div>
                        <Label>Partition</Label>
                        <Input
                          type="number"
                          min={0}
                          value={test.queueConfig?.partition ?? 0}
                          onChange={(event) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              queueConfig: {
                                ...current.queueConfig!,
                                partition: Number(event.target.value) || 0,
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
                        <Label>Timeout (seconds)</Label>
                        <Input
                          type="number"
                          min={1}
                          value={test.queueConfig?.timeout ?? 10}
                          onChange={(event) =>
                            updateTest(test.id, (current) => ({
                              ...current,
                              queueConfig: {
                                ...current.queueConfig!,
                                timeout: Number(event.target.value) || 10,
                              },
                            }))
                          }
                        />
                      </div>
                    )}

                    {(test.queueConfig?.operation || "") === "consume" && (
                      <>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={test.queueConfig?.fromBeginning ?? false}
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
                          <span className="text-sm">Read from beginning</span>
                        </div>

                        <div>
                          <Label>Expected Count</Label>
                          <Input
                            type="number"
                            min={1}
                            value={test.queueConfig?.expectedCount ?? 1}
                            onChange={(event) =>
                              updateTest(test.id, (current) => ({
                                ...current,
                                queueConfig: {
                                  ...current.queueConfig!,
                                  expectedCount:
                                    Number(event.target.value) || 1,
                                },
                              }))
                            }
                          />
                        </div>

                        <div className="md:col-span-2">
                          <Label>Expected Message</Label>
                          <Input
                            value={String(test.queueConfig?.expectedMessage ?? "")}
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

                    {(test.queueConfig?.operation || "") === "check_topic" && (
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={test.queueConfig?.expectedExists ?? true}
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
                        <span className="text-sm">Expected to exist</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
