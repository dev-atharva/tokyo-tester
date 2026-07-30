"use client";

import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateId } from "@/lib/generate-id";
import type {
  MockServerExpectation,
  MockServerHttpMethod,
} from "../types/react-flow-cots";

const HTTP_METHODS: Array<{ label: string; value: MockServerHttpMethod }> = [
  { label: "GET", value: "GET" },
  { label: "POST", value: "POST" },
  { label: "PUT", value: "PUT" },
  { label: "PATCH", value: "PATCH" },
  { label: "DELETE", value: "DELETE" },
  { label: "HEAD", value: "HEAD" },
  { label: "OPTIONS", value: "OPTIONS" },
];

interface MockServerExpectationEditorProps {
  expectations: MockServerExpectation[];
  onChange: (expectations: MockServerExpectation[]) => void;
}

export function MockServerExpectationEditor({
  expectations,
  onChange,
}: MockServerExpectationEditorProps) {
  const updateExpectation = (
    id: string,
    update: (expectation: MockServerExpectation) => MockServerExpectation,
  ) => {
    onChange(
      expectations.map((expectation) =>
        expectation.id === id ? update(expectation) : expectation,
      ),
    );
  };

  const moveExpectation = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= expectations.length) return;
    const next = [...expectations];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addExpectation = () => {
    onChange([
      ...expectations,
      {
        id: generateId(),
        request: { method: "GET", path: "/api/example", headers: {} },
        response: {
          statusCode: 200,
          headers: { "Content-Type": "application/json" },
          body: '{"message":"ok"}',
        },
      },
    ]);
  };

  return (
    <FieldSet>
      <div className="flex items-start justify-between gap-4">
        <div>
          <FieldLegend>Mock expectations</FieldLegend>
          <FieldDescription>
            Match an incoming request and define exactly what MockServer should
            return before scenarios begin.
          </FieldDescription>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={addExpectation}
        >
          <IconPlus data-icon="inline-start" />
          Add expectation
        </Button>
      </div>

      {expectations.length === 0 ? (
        <Alert>
          <IconInfoCircle />
          <AlertTitle>No mocked endpoints yet</AlertTitle>
          <AlertDescription>
            MockServer will start normally, but unmatched requests will receive
            its default response until you add an expectation.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          {expectations.map((expectation, index) => (
            <Card key={expectation.id} size="sm">
              <CardHeader>
                <CardTitle>
                  {expectation.request.method} {expectation.request.path || "/"}
                </CardTitle>
                <CardDescription>Expectation {index + 1}</CardDescription>
                <CardAction className="flex gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move expectation ${index + 1} up`}
                    disabled={index === 0}
                    onClick={() => moveExpectation(index, -1)}
                  >
                    <IconArrowUp />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Move expectation ${index + 1} down`}
                    disabled={index === expectations.length - 1}
                    onClick={() => moveExpectation(index, 1)}
                  >
                    <IconArrowDown />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Remove expectation ${index + 1}`}
                    onClick={() =>
                      onChange(
                        expectations.filter(
                          (candidate) => candidate.id !== expectation.id,
                        ),
                      )
                    }
                  >
                    <IconTrash />
                  </Button>
                </CardAction>
              </CardHeader>

              <CardContent>
                <FieldGroup>
                  <FieldSet>
                    <FieldLegend variant="label">Request matcher</FieldLegend>
                    <FieldGroup className="gap-3">
                      <div className="grid grid-cols-[8rem_1fr] gap-3">
                        <Field>
                          <FieldLabel>Method</FieldLabel>
                          <Select
                            items={HTTP_METHODS}
                            value={expectation.request.method}
                            onValueChange={(method) =>
                              updateExpectation(expectation.id, (current) => ({
                                ...current,
                                request: {
                                  ...current.request,
                                  method: (method ??
                                    "GET") as MockServerHttpMethod,
                                },
                              }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent alignItemWithTrigger={false}>
                              <SelectGroup>
                                {HTTP_METHODS.map((method) => (
                                  <SelectItem
                                    key={method.value}
                                    value={method.value}
                                  >
                                    {method.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field
                          data-invalid={
                            !expectation.request.path.startsWith("/")
                          }
                        >
                          <FieldLabel htmlFor={`${expectation.id}-path`}>
                            Path
                          </FieldLabel>
                          <Input
                            id={`${expectation.id}-path`}
                            value={expectation.request.path}
                            aria-invalid={
                              !expectation.request.path.startsWith("/")
                            }
                            placeholder="/api/users/42"
                            onChange={(event) =>
                              updateExpectation(expectation.id, (current) => ({
                                ...current,
                                request: {
                                  ...current.request,
                                  path: event.target.value,
                                },
                              }))
                            }
                          />
                        </Field>
                      </div>
                      <HeaderFields
                        label="Request headers"
                        headers={expectation.request.headers ?? {}}
                        onChange={(headers) =>
                          updateExpectation(expectation.id, (current) => ({
                            ...current,
                            request: { ...current.request, headers },
                          }))
                        }
                      />
                      <Field>
                        <FieldLabel htmlFor={`${expectation.id}-request-body`}>
                          Exact request body
                        </FieldLabel>
                        <Textarea
                          id={`${expectation.id}-request-body`}
                          value={expectation.request.body ?? ""}
                          placeholder="Optional body matcher"
                          className="min-h-20 font-mono"
                          onChange={(event) =>
                            updateExpectation(expectation.id, (current) => ({
                              ...current,
                              request: {
                                ...current.request,
                                body: event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    </FieldGroup>
                  </FieldSet>

                  <FieldSet>
                    <FieldLegend variant="label">Response</FieldLegend>
                    <FieldGroup className="gap-3">
                      <Field
                        data-invalid={
                          expectation.response.statusCode < 100 ||
                          expectation.response.statusCode > 599
                        }
                      >
                        <FieldLabel htmlFor={`${expectation.id}-status`}>
                          Status code
                        </FieldLabel>
                        <Input
                          id={`${expectation.id}-status`}
                          type="number"
                          min={100}
                          max={599}
                          value={expectation.response.statusCode}
                          aria-invalid={
                            expectation.response.statusCode < 100 ||
                            expectation.response.statusCode > 599
                          }
                          onChange={(event) =>
                            updateExpectation(expectation.id, (current) => ({
                              ...current,
                              response: {
                                ...current.response,
                                statusCode: Number(event.target.value),
                              },
                            }))
                          }
                        />
                      </Field>
                      <HeaderFields
                        label="Response headers"
                        headers={expectation.response.headers ?? {}}
                        onChange={(headers) =>
                          updateExpectation(expectation.id, (current) => ({
                            ...current,
                            response: { ...current.response, headers },
                          }))
                        }
                      />
                      <Field>
                        <FieldLabel htmlFor={`${expectation.id}-response-body`}>
                          Response body
                        </FieldLabel>
                        <Textarea
                          id={`${expectation.id}-response-body`}
                          value={expectation.response.body ?? ""}
                          placeholder='{"message":"ok"}'
                          className="min-h-24 font-mono"
                          onChange={(event) =>
                            updateExpectation(expectation.id, (current) => ({
                              ...current,
                              response: {
                                ...current.response,
                                body: event.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    </FieldGroup>
                  </FieldSet>
                </FieldGroup>
              </CardContent>
              <CardFooter className="text-muted-foreground">
                Scenarios can now target port 1080 and assert this response.
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </FieldSet>
  );
}

function HeaderFields({
  label,
  headers,
  onChange,
}: {
  label: string;
  headers: Record<string, string>;
  onChange: (headers: Record<string, string>) => void;
}) {
  const entries = Object.entries(headers);
  return (
    <Field>
      <div className="flex items-center justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() => {
            const base = "X-Header";
            let name = base;
            let suffix = 2;
            while (name in headers) {
              name = `${base}-${suffix}`;
              suffix += 1;
            }
            onChange({ ...headers, [name]: "" });
          }}
        >
          <IconPlus data-icon="inline-start" />
          Add header
        </Button>
      </div>
      {entries.length === 0 ? (
        <FieldDescription>No headers configured.</FieldDescription>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(([name, value], index) => (
            <div key={name} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                value={name}
                aria-label={`${label} ${index + 1} name`}
                onChange={(event) => {
                  const next = { ...headers };
                  delete next[name];
                  next[event.target.value] = value;
                  onChange(next);
                }}
              />
              <Input
                value={value}
                aria-label={`${label} ${index + 1} value`}
                onChange={(event) =>
                  onChange({ ...headers, [name]: event.target.value })
                }
              />
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => {
                  const next = { ...headers };
                  delete next[name];
                  onChange(next);
                }}
              >
                <IconTrash />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Field>
  );
}
