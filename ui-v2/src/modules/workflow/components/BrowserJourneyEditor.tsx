"use client";

import {
  IconAlertTriangle,
  IconArrowDown,
  IconArrowUp,
  IconBrowser,
  IconClick,
  IconCodeDots,
  IconEye,
  IconForms,
  IconKey,
  IconLink,
  IconPlus,
  IconRoute,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { generateId } from "@/lib/generate-id";
import { cn } from "@/lib/utils";
import {
  browserTargetOptions,
  JOURNEY_OPERATION_LABELS,
  type JourneyOperation,
  journeyStepOperation,
  orderedScenarioSteps,
  validateBrowserJourney,
} from "../lib/scenario-journey";
import type {
  BrowserLocator,
  FlowNode,
  Scenario,
  ScenarioStep,
} from "../types/react-flow-cots";

const operationItems = Object.entries(JOURNEY_OPERATION_LABELS).map(
  ([value, label]) => ({ value, label }),
);
const locatorItems = [
  { value: "role", label: "Role + accessible name" },
  { value: "label", label: "Form label" },
  { value: "text", label: "Visible text" },
  { value: "testId", label: "Test ID" },
];
const roleItems = [
  "button",
  "link",
  "heading",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "option",
  "tab",
  "dialog",
].map((value) => ({ value, label: value }));

const operationIcons: Record<JourneyOperation, typeof IconRoute> = {
  navigate: IconRoute,
  fill: IconForms,
  click: IconClick,
  url: IconLink,
  visible: IconEye,
  delay: IconCodeDots,
};

function defaultLocator(): BrowserLocator {
  return { strategy: "role", role: "button", name: "" };
}

function createStep(operation: JourneyOperation): ScenarioStep {
  const id = generateId();
  const base = { id, name: JOURNEY_OPERATION_LABELS[operation] };
  switch (operation) {
    case "navigate":
      return { ...base, kind: "action", action: { operation, path: "/" } };
    case "fill":
      return {
        ...base,
        kind: "action",
        action: {
          operation,
          locator: { strategy: "label", value: "" },
          value: { source: "literal", value: "" },
        },
      };
    case "click":
      return {
        ...base,
        kind: "action",
        action: { operation, locator: defaultLocator() },
      };
    case "url":
      return {
        ...base,
        kind: "assertion",
        assertion: { operation, path: "/" },
      };
    case "visible":
      return {
        ...base,
        kind: "assertion",
        assertion: { operation, locator: defaultLocator() },
      };
    case "delay":
      return {
        ...base,
        kind: "control",
        control: { operation, durationMs: 500 },
      };
  }
}

function changeOperation(
  step: ScenarioStep,
  operation: JourneyOperation,
): ScenarioStep {
  const next = createStep(operation);
  return {
    ...next,
    id: step.id,
    name:
      JOURNEY_OPERATION_LABELS[journeyStepOperation(step)] === step.name
        ? JOURNEY_OPERATION_LABELS[operation]
        : step.name,
    timeoutMs: step.timeoutMs,
  };
}

function operationTone(operation: JourneyOperation) {
  if (operation === "url" || operation === "visible") return "secondary";
  if (operation === "delay") return "outline";
  return "default";
}

interface BrowserJourneyEditorProps {
  scenario: Scenario;
  nodes: FlowNode[];
  onUpdate: (updates: Partial<Scenario>) => void;
}

export function BrowserJourneyEditor({
  scenario,
  nodes,
  onUpdate,
}: BrowserJourneyEditorProps) {
  const ordered = useMemo(() => orderedScenarioSteps(scenario), [scenario]);
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const [selectedStepId, setSelectedStepId] = useState<string | null>(
    ordered[0]?.id ?? null,
  );
  useEffect(() => {
    if (!ordered.some((step) => step.id === selectedStepId)) {
      setSelectedStepId(ordered[0]?.id ?? null);
    }
  }, [ordered, selectedStepId]);

  const selectedStep = ordered.find((step) => step.id === selectedStepId);
  const targets = useMemo(() => browserTargetOptions(nodes), [nodes]);
  const validation = useMemo(
    () => validateBrowserJourney(scenario, nodes),
    [nodes, scenario],
  );
  const selectedTarget = targets.find(
    (target) => target.service === scenario.environment?.browser.targetService,
  );

  const updateSteps = (steps: ScenarioStep[]) => {
    orderedRef.current = steps;
    onUpdate({ steps, stepOrder: steps.map((step) => step.id) });
  };
  const replaceStep = (next: ScenarioStep) =>
    updateSteps(
      orderedRef.current.map((step) => (step.id === next.id ? next : step)),
    );
  const addStep = (operation: JourneyOperation = "navigate") => {
    const step = createStep(operation);
    updateSteps([...orderedRef.current, step]);
    setSelectedStepId(step.id);
  };
  const moveStep = (stepId: string, direction: -1 | 1) => {
    const current = orderedRef.current;
    const index = current.findIndex((step) => step.id === stepId);
    const destination = index + direction;
    if (index < 0 || destination < 0 || destination >= current.length) return;
    const next = [...current];
    [next[index], next[destination]] = [next[destination], next[index]];
    updateSteps(next);
  };

  return (
    <div data-testid="browser-journey-editor" className="grid gap-4">
      <Card size="sm" data-testid="browser-environment-card">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <IconBrowser aria-hidden="true" /> Environment
          </CardTitle>
          <CardDescription>
            One runner-managed Chromium browser opens this service inside the
            isolated workflow network.
          </CardDescription>
          <CardAction>
            <Badge variant="outline">Browser</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          {targets.length === 0 ? (
            <Alert variant="destructive">
              <IconAlertTriangle />
              <AlertTitle>No browser target is available</AlertTitle>
              <AlertDescription>
                Add a container port to an application service before
                configuring this journey.
              </AlertDescription>
            </Alert>
          ) : (
            <FieldGroup className="grid gap-4 md:grid-cols-2">
              <Field
                data-invalid={Boolean(
                  validation.byField["environment.targetService"],
                )}
              >
                <FieldLabel htmlFor={`browser-service-${scenario.id}`}>
                  Target service
                </FieldLabel>
                <Select
                  items={targets.map((target) => ({
                    value: target.service,
                    label: target.label,
                  }))}
                  value={scenario.environment?.browser.targetService ?? null}
                  onValueChange={(value) => {
                    const target = targets.find(
                      (item) => item.service === value,
                    );
                    if (!value || !target) return;
                    onUpdate({
                      environment: {
                        driver: "browser",
                        browser: {
                          targetService: value,
                          targetPort: target.ports[0] ?? "",
                        },
                      },
                    });
                  }}
                >
                  <SelectTrigger
                    id={`browser-service-${scenario.id}`}
                    className="w-full"
                    aria-invalid={Boolean(
                      validation.byField["environment.targetService"],
                    )}
                  >
                    <SelectValue placeholder="Choose a service" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Workflow services</SelectLabel>
                      {targets.map((target) => (
                        <SelectItem key={target.service} value={target.service}>
                          {target.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  The browser uses the service name on the workflow network.
                </FieldDescription>
                <FieldError>
                  {validation.byField["environment.targetService"]}
                </FieldError>
              </Field>

              <Field
                data-invalid={Boolean(
                  validation.byField["environment.targetPort"],
                )}
              >
                <FieldLabel htmlFor={`browser-port-${scenario.id}`}>
                  Container port
                </FieldLabel>
                <Select
                  items={(selectedTarget?.ports || []).map((port) => ({
                    value: port,
                    label: port,
                  }))}
                  value={scenario.environment?.browser.targetPort ?? null}
                  disabled={!selectedTarget}
                  onValueChange={(value) => {
                    if (!value || !scenario.environment) return;
                    onUpdate({
                      environment: {
                        ...scenario.environment,
                        browser: {
                          ...scenario.environment.browser,
                          targetPort: value,
                        },
                      },
                    });
                  }}
                >
                  <SelectTrigger
                    id={`browser-port-${scenario.id}`}
                    className="w-full"
                    aria-invalid={Boolean(
                      validation.byField["environment.targetPort"],
                    )}
                  >
                    <SelectValue placeholder="Choose a port" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Exposed container ports</SelectLabel>
                      {(selectedTarget?.ports || []).map((port) => (
                        <SelectItem key={port} value={port}>
                          {port}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  Host port mappings are intentionally ignored.
                </FieldDescription>
                <FieldError>
                  {validation.byField["environment.targetPort"]}
                </FieldError>
              </Field>
            </FieldGroup>
          )}
        </CardContent>
      </Card>

      {!validation.valid ? (
        <Alert variant="destructive" data-testid="journey-validation-summary">
          <IconAlertTriangle />
          <AlertTitle>
            {validation.issues.length} journey detail
            {validation.issues.length === 1 ? " needs" : "s need"} attention
          </AlertTitle>
          <AlertDescription>
            Select a marked step to repair its fields before starting a run.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card size="sm">
        <CardHeader className="border-b">
          <CardTitle>Journey sequence</CardTitle>
          <CardDescription>
            Actions and assertions share one browser page and stop at the first
            failure.
          </CardDescription>
          <CardAction>
            <Button size="sm" onClick={() => addStep()}>
              <IconPlus data-icon="inline-start" /> Add step
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {ordered.length === 0 ? (
            <button
              type="button"
              onClick={() => addStep()}
              className="grid w-full place-items-center border border-dashed p-8 text-center hover:bg-muted/30"
            >
              <span className="text-xs font-medium">
                Add the first browser step
              </span>
              <span className="mt-1 text-xs text-muted-foreground">
                Start by navigating to an origin-relative path.
              </span>
            </button>
          ) : (
            <ol className="flex min-w-max items-center gap-2 pb-1">
              {ordered.map((step, index) => {
                const operation = journeyStepOperation(step);
                const Icon = operationIcons[operation];
                const issueCount = validation.issues.filter(
                  (issue) => issue.stepId === step.id,
                ).length;
                return (
                  <li key={step.id} className="flex items-center gap-2">
                    {index > 0 ? (
                      <span className="h-px w-5 bg-border" aria-hidden="true" />
                    ) : null}
                    <button
                      type="button"
                      aria-pressed={selectedStepId === step.id}
                      onClick={() => setSelectedStepId(step.id)}
                      className={cn(
                        "grid min-w-40 grid-cols-[28px_minmax(0,1fr)] items-center gap-2 border p-2 text-left transition-colors hover:bg-muted/40",
                        selectedStepId === step.id &&
                          "border-primary bg-primary/5",
                        issueCount > 0 && "border-destructive/60",
                      )}
                    >
                      <span className="grid size-7 place-items-center border bg-muted/40">
                        <Icon aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {index + 1} · {step.kind}
                        </span>
                        <span className="block truncate text-xs font-medium">
                          {step.name || JOURNEY_OPERATION_LABELS[operation]}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {ordered.length > 0 ? (
        <div className="grid min-h-[29rem] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card size="sm" className="min-h-0">
            <CardHeader className="border-b">
              <CardTitle>Ordered outline</CardTitle>
              <CardDescription>
                {ordered.length} fail-fast steps
              </CardDescription>
            </CardHeader>
            <CardContent className="min-h-0 p-0">
              <ScrollArea className="h-[28rem]">
                <ol className="grid gap-1 p-2">
                  {ordered.map((step, index) => {
                    const operation = journeyStepOperation(step);
                    const issueCount = validation.issues.filter(
                      (issue) => issue.stepId === step.id,
                    ).length;
                    return (
                      <li
                        key={step.id}
                        className={cn(
                          "grid grid-cols-[minmax(0,1fr)_auto] items-center border",
                          selectedStepId === step.id &&
                            "border-primary bg-primary/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedStepId(step.id)}
                          className="min-w-0 p-2 text-left"
                        >
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="truncate text-xs font-medium">
                              {step.name || JOURNEY_OPERATION_LABELS[operation]}
                            </span>
                            {issueCount > 0 ? (
                              <Badge variant="destructive">{issueCount}</Badge>
                            ) : null}
                          </span>
                          <span className="mt-1 block pl-6 text-[10px] capitalize text-muted-foreground">
                            {step.kind} · {JOURNEY_OPERATION_LABELS[operation]}
                          </span>
                        </button>
                        <div className="grid grid-cols-2 border-l">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === 0}
                            aria-label={`Move ${step.name} up`}
                            title="Move up"
                            onClick={() => moveStep(step.id, -1)}
                          >
                            <IconArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            disabled={index === ordered.length - 1}
                            aria-label={`Move ${step.name} down`}
                            title="Move down"
                            onClick={() => moveStep(step.id, 1)}
                          >
                            <IconArrowDown />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </ScrollArea>
            </CardContent>
          </Card>

          {selectedStep ? (
            <StepInspector
              key={selectedStep.id}
              step={selectedStep}
              index={ordered.findIndex((step) => step.id === selectedStep.id)}
              validation={validation.byField}
              onChange={replaceStep}
              onDelete={() => {
                const next = ordered.filter(
                  (step) => step.id !== selectedStep.id,
                );
                updateSteps(next);
                setSelectedStepId(next[0]?.id ?? null);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StepInspector({
  step,
  index,
  validation,
  onChange,
  onDelete,
}: {
  step: ScenarioStep;
  index: number;
  validation: Record<string, string>;
  onChange: (step: ScenarioStep) => void;
  onDelete: () => void;
}) {
  const prefix = `steps.${step.id}`;
  const operation = journeyStepOperation(step);
  const OperationIcon = operationIcons[operation];
  const config =
    step.kind === "action"
      ? step.action
      : step.kind === "assertion"
        ? step.assertion
        : step.control;

  return (
    <Card size="sm" data-testid="browser-step-inspector">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <OperationIcon aria-hidden="true" /> Step {index + 1}
        </CardTitle>
        <CardDescription>
          Configure one operation against the shared browser page.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <IconTrash data-icon="inline-start" /> Delete
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
            <Field data-invalid={Boolean(validation[`${prefix}.name`])}>
              <FieldLabel htmlFor={`${step.id}-name`}>Step name</FieldLabel>
              <Input
                id={`${step.id}-name`}
                value={step.name}
                aria-invalid={Boolean(validation[`${prefix}.name`])}
                onChange={(event) =>
                  onChange({ ...step, name: event.target.value })
                }
              />
              <FieldError>{validation[`${prefix}.name`]}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`${step.id}-operation`}>
                Operation
              </FieldLabel>
              <Select
                items={operationItems}
                value={operation}
                onValueChange={(value) => {
                  if (value)
                    onChange(changeOperation(step, value as JourneyOperation));
                }}
              >
                <SelectTrigger id={`${step.id}-operation`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Actions</SelectLabel>
                    {operationItems.slice(0, 3).map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Assertions</SelectLabel>
                    {operationItems.slice(3, 5).map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Control</SelectLabel>
                    <SelectItem value="delay">Wait</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant={operationTone(operation)}>{step.kind}</Badge>
            <Badge variant="outline">
              {JOURNEY_OPERATION_LABELS[operation]}
            </Badge>
            <Badge variant="outline">Fail fast</Badge>
          </div>

          {"path" in config ? (
            <Field data-invalid={Boolean(validation[`${prefix}.path`])}>
              <FieldLabel htmlFor={`${step.id}-path`}>
                Origin-relative path
              </FieldLabel>
              <Input
                id={`${step.id}-path`}
                value={config.path}
                placeholder="/checkout"
                aria-invalid={Boolean(validation[`${prefix}.path`])}
                onChange={(event) => {
                  if (
                    step.kind === "action" &&
                    step.action.operation === "navigate"
                  ) {
                    onChange({
                      ...step,
                      action: { ...step.action, path: event.target.value },
                    });
                  } else if (
                    step.kind === "assertion" &&
                    step.assertion.operation === "url"
                  ) {
                    onChange({
                      ...step,
                      assertion: {
                        ...step.assertion,
                        path: event.target.value,
                      },
                    });
                  }
                }}
              />
              <FieldDescription>
                The service-network origin, query values, and fragments are
                never stored as observed evidence.
              </FieldDescription>
              <FieldError>{validation[`${prefix}.path`]}</FieldError>
            </Field>
          ) : null}

          {"locator" in config ? (
            <LocatorFields
              stepId={step.id}
              locator={config.locator}
              validation={validation}
              onChange={(locator) => {
                if (
                  step.kind === "action" &&
                  step.action.operation === "fill"
                ) {
                  onChange({ ...step, action: { ...step.action, locator } });
                } else if (
                  step.kind === "action" &&
                  step.action.operation === "click"
                ) {
                  onChange({ ...step, action: { ...step.action, locator } });
                } else if (
                  step.kind === "assertion" &&
                  step.assertion.operation === "visible"
                ) {
                  onChange({
                    ...step,
                    assertion: { ...step.assertion, locator },
                  });
                }
              }}
            />
          ) : null}

          {step.kind === "action" && step.action.operation === "fill" ? (
            <FillValueFields
              step={step}
              validation={validation}
              onChange={onChange}
            />
          ) : null}

          {step.kind === "control" ? (
            <Field data-invalid={Boolean(validation[`${prefix}.durationMs`])}>
              <FieldLabel htmlFor={`${step.id}-duration`}>
                Wait duration (ms)
              </FieldLabel>
              <Input
                id={`${step.id}-duration`}
                type="number"
                min={0}
                value={step.control.durationMs}
                aria-invalid={Boolean(validation[`${prefix}.durationMs`])}
                onChange={(event) =>
                  onChange({
                    ...step,
                    control: {
                      operation: "delay",
                      durationMs: Number(event.target.value),
                    },
                  })
                }
              />
              <FieldError>{validation[`${prefix}.durationMs`]}</FieldError>
            </Field>
          ) : null}

          <Field data-invalid={Boolean(validation[`${prefix}.timeoutMs`])}>
            <FieldLabel htmlFor={`${step.id}-timeout`}>
              Timeout override (ms)
            </FieldLabel>
            <Input
              id={`${step.id}-timeout`}
              type="number"
              min={0}
              value={step.timeoutMs ?? ""}
              placeholder="Use runner default"
              aria-invalid={Boolean(validation[`${prefix}.timeoutMs`])}
              onChange={(event) =>
                onChange({
                  ...step,
                  timeoutMs: event.target.value
                    ? Number(event.target.value)
                    : undefined,
                })
              }
            />
            <FieldDescription>
              Leave blank to use the bounded runner default.
            </FieldDescription>
            <FieldError>{validation[`${prefix}.timeoutMs`]}</FieldError>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function LocatorFields({
  stepId,
  locator,
  validation,
  onChange,
}: {
  stepId: string;
  locator: BrowserLocator;
  validation: Record<string, string>;
  onChange: (locator: BrowserLocator) => void;
}) {
  const prefix = `steps.${stepId}.locator`;
  const valueLabel =
    locator.strategy === "label"
      ? "Form label"
      : locator.strategy === "text"
        ? "Visible text"
        : "Test ID";
  return (
    <FieldSet className="border p-4">
      <FieldLegend>Accessible locator</FieldLegend>
      <FieldDescription>
        Prefer the same role, label, or visible name a person uses. Test IDs are
        available as an explicit fallback.
      </FieldDescription>
      <FieldGroup className="mt-2">
        <Field>
          <FieldLabel htmlFor={`${stepId}-locator-strategy`}>
            Strategy
          </FieldLabel>
          <Select
            items={locatorItems}
            value={locator.strategy}
            onValueChange={(value) => {
              if (!value) return;
              onChange(
                value === "role"
                  ? defaultLocator()
                  : {
                      strategy: value as "label" | "text" | "testId",
                      value: "",
                    },
              );
            }}
          >
            <SelectTrigger id={`${stepId}-locator-strategy`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Recommended first</SelectLabel>
                {locatorItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        {locator.strategy === "role" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field data-invalid={Boolean(validation[`${prefix}.role`])}>
              <FieldLabel htmlFor={`${stepId}-locator-role`}>Role</FieldLabel>
              <Select
                items={roleItems}
                value={locator.role}
                onValueChange={(value) => {
                  if (value) onChange({ ...locator, role: value });
                }}
              >
                <SelectTrigger
                  id={`${stepId}-locator-role`}
                  className="w-full"
                  aria-invalid={Boolean(validation[`${prefix}.role`])}
                >
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>ARIA roles</SelectLabel>
                    {roleItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError>{validation[`${prefix}.role`]}</FieldError>
            </Field>
            <Field data-invalid={Boolean(validation[`${prefix}.name`])}>
              <FieldLabel htmlFor={`${stepId}-locator-name`}>
                Accessible name
              </FieldLabel>
              <Input
                id={`${stepId}-locator-name`}
                value={locator.name}
                placeholder="Place order"
                aria-invalid={Boolean(validation[`${prefix}.name`])}
                onChange={(event) =>
                  onChange({ ...locator, name: event.target.value })
                }
              />
              <FieldError>{validation[`${prefix}.name`]}</FieldError>
            </Field>
          </div>
        ) : (
          <Field data-invalid={Boolean(validation[`${prefix}.value`])}>
            <FieldLabel htmlFor={`${stepId}-locator-value`}>
              {valueLabel}
            </FieldLabel>
            <Input
              id={`${stepId}-locator-value`}
              value={locator.value}
              aria-invalid={Boolean(validation[`${prefix}.value`])}
              onChange={(event) =>
                onChange({ ...locator, value: event.target.value })
              }
            />
            <FieldError>{validation[`${prefix}.value`]}</FieldError>
          </Field>
        )}
        <Field orientation="horizontal">
          <Checkbox
            id={`${stepId}-locator-exact`}
            checked={locator.exact ?? false}
            onCheckedChange={(checked) =>
              onChange({ ...locator, exact: checked })
            }
          />
          <FieldLabel htmlFor={`${stepId}-locator-exact`}>
            Exact match
          </FieldLabel>
        </Field>
      </FieldGroup>
    </FieldSet>
  );
}

function FillValueFields({
  step,
  validation,
  onChange,
}: {
  step: ScenarioStep;
  validation: Record<string, string>;
  onChange: (step: ScenarioStep) => void;
}) {
  if (step.kind !== "action" || step.action.operation !== "fill") return null;
  const action = step.action;
  const prefix = `steps.${step.id}.value`;
  const source = action.value.source;
  return (
    <FieldSet className="border p-4">
      <FieldLegend>Value source</FieldLegend>
      <FieldDescription>
        Store durable non-sensitive text, or reference a value entered only when
        a human starts the run.
      </FieldDescription>
      <ToggleGroup
        variant="outline"
        size="sm"
        value={[source]}
        onValueChange={(values) => {
          const value = values.at(-1);
          if (value === "literal") {
            onChange({
              ...step,
              action: { ...action, value: { source: "literal", value: "" } },
            });
          } else if (value === "run-secret") {
            onChange({
              ...step,
              action: {
                ...action,
                value: { source: "run-secret", secretRef: "" },
              },
            });
          }
        }}
      >
        <ToggleGroupItem value="literal">
          <IconForms data-icon="inline-start" /> Literal
        </ToggleGroupItem>
        <ToggleGroupItem value="run-secret">
          <IconKey data-icon="inline-start" /> Run secret
        </ToggleGroupItem>
      </ToggleGroup>
      {source === "literal" ? (
        <Field data-invalid={Boolean(validation[`${prefix}.literal`])}>
          <FieldLabel htmlFor={`${step.id}-literal`}>Durable value</FieldLabel>
          <Input
            id={`${step.id}-literal`}
            value={action.value.source === "literal" ? action.value.value : ""}
            aria-invalid={Boolean(validation[`${prefix}.literal`])}
            onChange={(event) =>
              onChange({
                ...step,
                action: {
                  ...action,
                  value: { source: "literal", value: event.target.value },
                },
              })
            }
          />
          <FieldError>{validation[`${prefix}.literal`]}</FieldError>
        </Field>
      ) : (
        <Field data-invalid={Boolean(validation[`${prefix}.secretRef`])}>
          <FieldLabel htmlFor={`${step.id}-secret-ref`}>
            Run-secret reference
          </FieldLabel>
          <Input
            id={`${step.id}-secret-ref`}
            value={
              action.value.source === "run-secret" ? action.value.secretRef : ""
            }
            placeholder="checkout.password"
            autoComplete="off"
            aria-invalid={Boolean(validation[`${prefix}.secretRef`])}
            onChange={(event) =>
              onChange({
                ...step,
                action: {
                  ...action,
                  value: {
                    source: "run-secret",
                    secretRef: event.target.value,
                  },
                },
              })
            }
          />
          <FieldDescription>
            This is a reference name, never the secret value. Evidence is
            suppressed for any journey that resolves a run secret.
          </FieldDescription>
          <FieldError>{validation[`${prefix}.secretRef`]}</FieldError>
        </Field>
      )}
    </FieldSet>
  );
}
