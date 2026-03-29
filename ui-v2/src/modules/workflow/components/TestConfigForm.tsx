"use client";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import React, { useEffect } from "react";
import {
  Controller,
  type Path,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
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
  ExpectedResult,
  ServiceNodeData,
  TestDefination,
} from "../types/react-flow-cots";

interface TestConfigFormProps {
  serviceData: ServiceNodeData;
  onChange: (data: ServiceNodeData) => void;
}

interface TestFormData {
  tests: TestDefination[];
}

const EXPECTED_MODES = [
  { value: "rows", label: "Rows exist / not exist" },
  { value: "single", label: "Single value" },
  { value: "list", label: "List of values" },
  { value: "structured", label: "Structured rules" },
] as const;

export const TestConfigForm: React.FC<TestConfigFormProps> = ({
  serviceData,
  onChange,
}) => {
  const form = useForm<TestFormData>({
    defaultValues: {
      tests: serviceData.tests || [],
    },
  });

  const { control, register, watch, setValue } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "tests",
  });

  useEffect(() => {
    const sub = watch((value) => {
      onChange({
        ...serviceData,
        tests: value.tests as TestDefination[],
      });
    });
    return () => sub.unsubscribe();
  }, [watch, onChange, serviceData]);

  const addTest = () => {
    append({
      id: `test-${Date.now()}`,
      name: "New Test",
      type: "http",
      httpConfig: {
        method: "GET",
        path: "/",
        port: "80",
        expectedStatus: 200,
        expectedBody: {
          mode: "contains",
          value: "",
        },
      },
    });
  };

  return (
    <Form {...form}>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Tests</h3>
          <Button onClick={addTest}>
            <IconPlus className="h-4 w-4 mr-2" />
            Add Test
          </Button>
        </div>

        {fields.map((field, index) => {
          const type = watch(`tests.${index}.type`);

          return (
            <div key={field.id} className="rounded-lg border p-4 space-y-4">
              <div className="flex justify-between items-center">
                <h4 className="font-semibold">Test #{index + 1}</h4>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => remove(index)}
                >
                  <IconTrash className="h-4 w-4 mr-1" />
                  Remove
                </Button>
              </div>

              <div className="space-y-3">
                <div>
                  <Label>Test Name</Label>
                  <Input {...register(`tests.${index}.name`)} />
                </div>

                <div>
                  <Label>Test Type</Label>
                  <Controller
                    control={control}
                    name={`tests.${index}.type`}
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={(value) => {
                          field.onChange(value);

                          // reset configs
                          setValue(`tests.${index}.httpConfig`, undefined);
                          setValue(`tests.${index}.databaseConfig`, undefined);
                          setValue(`tests.${index}.shellConfig`, undefined);
                          setValue(`tests.${index}.cacheConfig`, undefined);
                          setValue(`tests.${index}.queueConfig`, undefined);

                          if (value === "http") {
                            setValue(`tests.${index}.httpConfig`, {
                              method: "GET",
                              path: "/",
                              port: "80",
                            });
                          }
                          if (value === "database") {
                            setValue(`tests.${index}.databaseConfig`, {
                              driver: "postgres",
                              database: "",
                              user: "",
                              password: "",
                              query: "",
                            });
                          }
                          if (value === "shell") {
                            setValue(`tests.${index}.shellConfig`, {
                              command: "",
                            });
                          }
                          if (value === "cache") {
                            setValue(`tests.${index}.cacheConfig`, {
                              service: "",
                              cacheType: "redis",
                              operation: "ping",
                            });
                          }
                          if (value === "queue") {
                            setValue(`tests.${index}.queueConfig`, {
                              service: "",
                              brokerType: "kafka",
                              operation: "produce",
                            });
                          }
                        }}
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
                    )}
                  />
                </div>

                <Separator />

                {/* HTTP CONFIG */}
                {type === "http" && (
                  <div className="space-y-3">
                    <Label>HTTP Config</Label>

                    <Controller
                      control={control}
                      name={`tests.${index}.httpConfig.method`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {["GET", "POST", "PUT", "DELETE", "PATCH"].map(
                              (m) => (
                                <SelectItem key={m} value={m}>
                                  {m}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      )}
                    />

                    <Input
                      placeholder="Path"
                      {...register(`tests.${index}.httpConfig.path`)}
                    />

                    <Input
                      placeholder="Port"
                      {...register(`tests.${index}.httpConfig.port`)}
                    />

                    <Textarea
                      placeholder="Headers (JSON)"
                      {...register(
                        `tests.${index}.httpConfig.headers` as Path<TestFormData>,
                      )}
                    />

                    <Textarea
                      placeholder="Body"
                      {...register(`tests.${index}.httpConfig.body`)}
                    />
                    <Separator />
                    <Label>Expected Status</Label>
                    <Input
                      type="number"
                      placeholder="Expected Status"
                      {...register(`tests.${index}.httpConfig.expectedStatus`, {
                        valueAsNumber: true,
                      })}
                    />
                    <Label>Expected Body</Label>
                    <Controller
                      control={control}
                      name={`tests.${index}.httpConfig.expectedBody.mode`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            const mode = value as "contains" | "json_partial";
                            field.onChange(mode);
                            setValue(`tests.${index}.httpConfig.expectedBody`, {
                              mode,
                              value: "",
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="contains">
                              Contains string
                            </SelectItem>
                            <SelectItem value="json_partial">
                              JSON partial match
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />
                    {(() => {
                      const expectedMode = watch(
                        `tests.${index}.httpConfig.expectedBody.mode`,
                      );

                      if (expectedMode === "contains") {
                        return (
                          <Textarea
                            placeholder="Expected substring"
                            {...register(
                              `tests.${index}.httpConfig.expectedBody.value`,
                            )}
                          />
                        );
                      }

                      if (expectedMode === "json_partial") {
                        return (
                          <Textarea
                            placeholder='JSON (e.g. { "status": "ok" })'
                            {...register(
                              `tests.${index}.httpConfig.expectedBody.value`,
                            )}
                          />
                        );
                      }

                      return null;
                    })()}
                  </div>
                )}

                {/* DATABASE CONFIG */}
                {type === "database" && (
                  <div className="space-y-4">
                    <Label>Database Config</Label>
                    <Input
                      placeholder="Database"
                      {...register(`tests.${index}.databaseConfig.database`)}
                    />
                    <Input
                      placeholder="User"
                      {...register(`tests.${index}.databaseConfig.user`)}
                    />
                    <Input
                      type="password"
                      placeholder="Password"
                      {...register(`tests.${index}.databaseConfig.password`)}
                    />
                    <Textarea
                      placeholder="SQL Query"
                      {...register(`tests.${index}.databaseConfig.query`)}
                    />

                    <Separator />
                    <Label>Expected Result</Label>

                    {/* Mode selector */}
                    <Controller
                      control={control}
                      name={`tests.${index}.databaseConfig.expectedResult.mode`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={(value) => {
                            field.onChange(value);

                            // reset expectedResult when mode changes
                            setValue(
                              `tests.${index}.databaseConfig.expectedResult`,
                              { mode: value } as ExpectedResult,
                            );
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPECTED_MODES.map((m) => (
                              <SelectItem key={m.value} value={m.value}>
                                {m.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />

                    {/* Watch expected mode */}
                    {(() => {
                      const expectedMode = watch(
                        `tests.${index}.databaseConfig.expectedResult.mode`,
                      );

                      /* ---------- ROWS (bool) ---------- */
                      if (expectedMode === "rows") {
                        return (
                          <Controller
                            control={control}
                            name={`tests.${index}.databaseConfig.expectedResult.value`}
                            render={({ field }) => (
                              <Select
                                value={String(field.value)}
                                onValueChange={(v) =>
                                  field.onChange(v === "true")
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">
                                    Rows must exist
                                  </SelectItem>
                                  <SelectItem value="false">
                                    No rows expected
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          />
                        );
                      }

                      /* ---------- SINGLE VALUE ---------- */
                      if (expectedMode === "single") {
                        return (
                          <Input
                            placeholder="Expected value"
                            {...register(
                              `tests.${index}.databaseConfig.expectedResult.value`,
                            )}
                          />
                        );
                      }

                      /* ---------- LIST ---------- */
                      if (expectedMode === "list") {
                        return (
                          <ValueListEditor
                            control={control}
                            name={`tests.${index}.databaseConfig.expectedResult.value`}
                          />
                        );
                      }

                      /* ---------- STRUCTURED ---------- */
                      if (expectedMode === "structured") {
                        return (
                          <div className="space-y-3 rounded border p-3">
                            <Input
                              type="number"
                              placeholder="Min rows"
                              {...register(
                                `tests.${index}.databaseConfig.expectedResult.min_rows`,
                                { valueAsNumber: true },
                              )}
                            />
                            <Input
                              type="number"
                              placeholder="Max rows"
                              {...register(
                                `tests.${index}.databaseConfig.expectedResult.max_rows`,
                                { valueAsNumber: true },
                              )}
                            />

                            <ColumnRulesEditor
                              control={control}
                              basePath={`tests.${index}.databaseConfig.expectedResult.columns`}
                            />
                          </div>
                        );
                      }

                      return null;
                    })()}
                  </div>
                )}

                {/* SHELL CONFIG */}
                {type === "shell" && (
                  <div className="space-y-3">
                    <Label>Shell Config</Label>
                    <Input
                      placeholder="Command"
                      {...register(`tests.${index}.shellConfig.command`)}
                    />
                    <Input
                      placeholder="Expected Output"
                      {...register(`tests.${index}.shellConfig.expectedOutput`)}
                    />
                    <Input
                      placeholder="Working Directory"
                      {...register(`tests.${index}.shellConfig.workdir`)}
                    />
                  </div>
                )}

                {/* CACHE CONFIG */}
                {type === "cache" && (
                  <div className="space-y-3">
                    <Label>Cache Config</Label>

                    <Input
                      placeholder="Service Name"
                      {...register(`tests.${index}.cacheConfig.service`)}
                    />

                    <Controller
                      control={control}
                      name={`tests.${index}.cacheConfig.cacheType`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="redis">Redis</SelectItem>
                            <SelectItem value="memcached">Memcached</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />

                    <Controller
                      control={control}
                      name={`tests.${index}.cacheConfig.operation`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
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
                      )}
                    />

                    {(() => {
                      const operation = watch(
                        `tests.${index}.cacheConfig.operation`,
                      );

                      return (
                        <>
                          {(operation === "set" ||
                            operation === "get" ||
                            operation === "exists" ||
                            operation === "delete" ||
                            operation === "del") && (
                            <Input
                              placeholder="Key"
                              {...register(`tests.${index}.cacheConfig.key`)}
                            />
                          )}

                          {operation === "set" && (
                            <>
                              <Input
                                placeholder="Value"
                                {...register(
                                  `tests.${index}.cacheConfig.value`,
                                )}
                              />
                              <Input
                                type="number"
                                placeholder="TTL (seconds)"
                                {...register(`tests.${index}.cacheConfig.ttl`, {
                                  valueAsNumber: true,
                                })}
                              />
                            </>
                          )}

                          {operation === "get" && (
                            <Input
                              placeholder="Expected Value"
                              {...register(
                                `tests.${index}.cacheConfig.expectedValue`,
                              )}
                            />
                          )}

                          {operation === "exists" && (
                            <Controller
                              control={control}
                              name={`tests.${index}.cacheConfig.expectedExists`}
                              render={({ field }) => (
                                <Select
                                  value={String(field.value)}
                                  onValueChange={(v) =>
                                    field.onChange(v === "true")
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">
                                      Should exist
                                    </SelectItem>
                                    <SelectItem value="false">
                                      Should not exist
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          )}

                          <Input
                            type="number"
                            placeholder="Database (0-15)"
                            {...register(`tests.${index}.cacheConfig.db`, {
                              valueAsNumber: true,
                            })}
                          />

                          <Input
                            type="password"
                            placeholder="Password (optional)"
                            {...register(`tests.${index}.cacheConfig.password`)}
                          />
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* QUEUE CONFIG */}
                {type === "queue" && (
                  <div className="space-y-3">
                    <Label>Queue Config</Label>

                    <Input
                      placeholder="Service Name"
                      {...register(`tests.${index}.queueConfig.service`)}
                    />

                    <Controller
                      control={control}
                      name={`tests.${index}.queueConfig.brokerType`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="kafka">Kafka</SelectItem>
                            <SelectItem value="rabbitmq">RabbitMQ</SelectItem>
                            <SelectItem value="nats">NATS</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />

                    <Controller
                      control={control}
                      name={`tests.${index}.queueConfig.operation`}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="produce">Produce</SelectItem>
                            <SelectItem value="consume">Consume</SelectItem>
                            <SelectItem value="produce_and_consume">
                              Produce & Consume
                            </SelectItem>
                            <SelectItem value="check_topic">
                              Check Topic
                            </SelectItem>
                            <SelectItem value="list_topics">
                              List Topics
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    />

                    {(() => {
                      const operation = watch(
                        `tests.${index}.queueConfig.operation`,
                      );

                      return (
                        <>
                          {(operation === "produce" ||
                            operation === "consume" ||
                            operation === "produce_and_consume" ||
                            operation === "check_topic") && (
                            <Input
                              placeholder="Topic"
                              {...register(`tests.${index}.queueConfig.topic`)}
                            />
                          )}

                          {(operation === "produce" ||
                            operation === "produce_and_consume") && (
                            <>
                              <Input
                                placeholder="Message"
                                {...register(
                                  `tests.${index}.queueConfig.message`,
                                )}
                              />
                              <Input
                                placeholder="Key (optional)"
                                {...register(`tests.${index}.queueConfig.key`)}
                              />
                              <Input
                                type="number"
                                placeholder="Partition (-1 for auto)"
                                {...register(
                                  `tests.${index}.queueConfig.partition`,
                                  {
                                    valueAsNumber: true,
                                  },
                                )}
                              />
                            </>
                          )}

                          {operation === "consume" && (
                            <>
                              <Input
                                type="number"
                                placeholder="Expected Count"
                                {...register(
                                  `tests.${index}.queueConfig.expectedCount`,
                                  {
                                    valueAsNumber: true,
                                  },
                                )}
                              />
                              <Input
                                placeholder="Expected Message (optional)"
                                {...register(
                                  `tests.${index}.queueConfig.expectedMessage`,
                                )}
                              />
                              <Input
                                type="number"
                                placeholder="Partition"
                                {...register(
                                  `tests.${index}.queueConfig.partition`,
                                  {
                                    valueAsNumber: true,
                                  },
                                )}
                              />
                              <Controller
                                control={control}
                                name={`tests.${index}.queueConfig.fromBeginning`}
                                render={({ field }) => (
                                  <Select
                                    value={String(field.value)}
                                    onValueChange={(v) =>
                                      field.onChange(v === "true")
                                    }
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="true">
                                        From beginning
                                      </SelectItem>
                                      <SelectItem value="false">
                                        Latest only
                                      </SelectItem>
                                    </SelectContent>
                                  </Select>
                                )}
                              />
                            </>
                          )}

                          {operation === "check_topic" && (
                            <Controller
                              control={control}
                              name={`tests.${index}.queueConfig.expectedExists`}
                              render={({ field }) => (
                                <Select
                                  value={String(field.value)}
                                  onValueChange={(v) =>
                                    field.onChange(v === "true")
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="true">
                                      Should exist
                                    </SelectItem>
                                    <SelectItem value="false">
                                      Should not exist
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                            />
                          )}

                          {(operation === "consume" ||
                            operation === "produce_and_consume") && (
                            <Input
                              type="number"
                              placeholder="Timeout (seconds)"
                              {...register(
                                `tests.${index}.queueConfig.timeout`,
                                {
                                  valueAsNumber: true,
                                },
                              )}
                            />
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Form>
  );
};

function ValueListEditor({
  control,
  name,
}: {
  control: UseFormReturn<TestFormData>;
  name: Path<TestFormData>;
}) {
  const { fields, append, remove } = useFieldArray({
    control: control.control,
    name,
  });

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={f.id} className="flex gap-2">
          <Input
            placeholder="Value"
            {...control.register(`${name}.${i}` as Path<TestFormData>)}
          />
          <Button
            type="button"
            size="icon"
            variant="destructive"
            onClick={() => remove(i)}
          >
            <IconTrash size={14} />
          </Button>
        </div>
      ))}
      <Button type="button" size="sm" onClick={() => append("")}>
        <IconPlus size={14} className="mr-1" />
        Add value
      </Button>
    </div>
  );
}

function ColumnRulesEditor({
  control,
  basePath,
}: {
  control: UseFormReturn<TestFormData>["control"];
  basePath: Path<TestFormData>;
}) {
  const [draftColumn, setDraftColumn] = React.useState("");
  const [activeColumn, setActiveColumn] = React.useState<string | null>(null);

  const columns =
    useWatch({
      control,
      name: basePath,
    }) || {};

  const columnNames = Object.keys(columns);

  return (
    <div className="space-y-3">
      {columnNames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {columnNames.map((col) => (
            <Button
              key={col}
              type="button"
              size="sm"
              variant={col === activeColumn ? "default" : "secondary"}
              onClick={() => setActiveColumn(col)}
            >
              {col}
            </Button>
          ))}
        </div>
      )}

      {!activeColumn && (
        <div className="space-y-2">
          <Input
            placeholder="Column name"
            value={draftColumn}
            onChange={(e) => setDraftColumn(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={!draftColumn.trim()}
            onClick={() => {
              setActiveColumn(draftColumn.trim());
              setDraftColumn("");
            }}
          >
            Add column
          </Button>
        </div>
      )}
      {activeColumn && (
        <div className="space-y-2 rounded border p-3">
          <Input disabled value={`Column: ${activeColumn}`} />

          <Input
            placeholder="Exact value"
            {...control.register(`${basePath}.${activeColumn}.value`)}
          />

          <Input
            placeholder="Allowed values (comma separated)"
            {...control.register(`${basePath}.${activeColumn}.in`)}
          />

          <Input
            placeholder="Contains substring"
            {...control.register(`${basePath}.${activeColumn}.contains`)}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setActiveColumn(null)}
          >
            Configure another column
          </Button>
        </div>
      )}
    </div>
  );
}
