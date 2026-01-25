"use client";
import React, { useEffect } from "react";
import { ServiceNodeData, TestDefination } from "../types/react-flow-cots";
import { useFieldArray, useForm, Controller, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Form } from "@/components/ui/form";

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
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="http">HTTP</SelectItem>
                          <SelectItem value="database">Database</SelectItem>
                          <SelectItem value="shell">Shell</SelectItem>
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

                    <Input
                      type="number"
                      placeholder="Expected Status"
                      {...register(`tests.${index}.httpConfig.expectedStatus`, {
                        valueAsNumber: true,
                      })}
                    />

                    <Textarea
                      placeholder="Headers (JSON)"
                      {...register(`tests.${index}.httpConfig.headers` as any)}
                    />

                    <Textarea
                      placeholder="Body"
                      {...register(`tests.${index}.httpConfig.body`)}
                    />
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

                    {/* ========== EXPECTED RESULT ========== */}
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
                              { mode: value } as any,
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
              </div>
            </div>
          );
        })}
      </div>
    </Form>
  );
};

function ValueListEditor({ control, name }: { control: any; name: string }) {
  const { fields, append, remove } = useFieldArray({
    control,
    name,
  });

  return (
    <div className="space-y-2">
      {fields.map((f, i) => (
        <div key={f.id} className="flex gap-2">
          <Input placeholder="Value" {...control.register(`${name}.${i}`)} />
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
  control: any;
  basePath: string;
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
