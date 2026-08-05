"use client";

import {
  IconAlertTriangle,
  IconBox,
  IconKey,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldTitle,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getCurrentSessionUserId } from "@/modules/auth/session-user";
import { GUIDED_DOCUMENTATION } from "../lib/builder-experience";
import {
  deriveRequiredRunSecretRefs,
  type RunSecretInput,
} from "../lib/run-secrets";
import { useRunSecretStore } from "../stores/run-secret-store";
import type {
  FlowNode,
  Scenario,
  TranslationError,
} from "../types/react-flow-cots";
import { ContextHelp, DocumentationLink } from "./BuilderHelp";

const EMPTY_SESSION_VALUES: Record<string, string> = {};

interface RunWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: FlowNode[];
  scenarios: Scenario[];
  validationErrors?: TranslationError[];
  isExecuting: boolean;
  onRun: (
    scenarioIds: string[],
    runSecrets: RunSecretInput[],
  ) => Promise<boolean>;
}

export function RunWorkflowDialog({
  open,
  onOpenChange,
  nodes,
  scenarios,
  validationErrors = [],
  isExecuting,
  onRun,
}: RunWorkflowDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState<Set<string>>(new Set());
  const scope = useMemo(
    () => ({
      userId: getCurrentSessionUserId() ?? scenarios[0]?.user_id ?? "",
      projectId: scenarios[0]?.projectId ?? "",
      workflowId: scenarios[0]?.workflowId ?? "",
    }),
    [scenarios],
  );
  const storedSessionValues = useRunSecretStore(
    (state) =>
      state.values[scope.userId]?.[scope.projectId]?.[scope.workflowId],
  );
  const sessionValues = storedSessionValues ?? EMPTY_SESSION_VALUES;
  const setSessionSecret = useRunSecretStore((state) => state.setSecret);
  const clearSessionSecret = useRunSecretStore((state) => state.clearSecret);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(scenarios.map((scenario) => scenario.id)));
      setDrafts({});
      setReplacing(new Set());
    }
  }, [open, scenarios]);

  const selectedScenarios = useMemo(
    () => scenarios.filter((scenario) => selectedIds.has(scenario.id)),
    [scenarios, selectedIds],
  );
  const requiredSecretRefs = useMemo(
    () => deriveRequiredRunSecretRefs(selectedScenarios),
    [selectedScenarios],
  );
  const unresolvedSecretRefs = requiredSecretRefs.filter(
    (secretRef) =>
      (replacing.has(secretRef) || sessionValues[secretRef] === undefined) &&
      !drafts[secretRef],
  );
  const selectedCount = selectedIds.size;
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isExecuting) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        data-testid="run-workflow-dialog"
        className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Review and run in Docker</DialogTitle>
          <DialogDescription>
            Select the scenarios for this isolated workflow run.
          </DialogDescription>
          <DocumentationLink href={GUIDED_DOCUMENTATION.lifecycle.href}>
            Understand provisioning and cleanup
          </DocumentationLink>
        </DialogHeader>
        <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-2">
          <div className="flex items-start gap-2">
            <IconBox className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">
                {nodes.length} managed services
              </p>
              <p className="text-xs text-muted-foreground">
                {nodes.length > 0
                  ? nodes.map((node) => node.data.label).join(", ")
                  : "Add a service before running."}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <IconShieldCheck className="mt-0.5 size-4 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-1">
                <p className="text-sm font-medium">Automatic cleanup</p>
                <ContextHelp label="automatic cleanup">
                  Tokyo Tester removes the containers and private Docker network
                  after the run, whether the scenarios pass or fail.
                </ContextHelp>
              </div>
              <p className="text-xs text-muted-foreground">
                Managed containers and the isolated network are removed after
                the run.
              </p>
            </div>
          </div>
        </div>
        {validationErrors.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <IconAlertTriangle className="size-4" />
              Fix {validationErrors.length} validation{" "}
              {validationErrors.length === 1 ? "error" : "errors"}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {validationErrors.map((error, index) => (
                <Badge key={`${error.field}-${index}`} variant="outline">
                  {error.message}
                </Badge>
              ))}
            </div>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <FieldSet>
            <FieldGroup data-slot="checkbox-group">
              {scenarios.map((scenario) => {
                const checked = selectedIds.has(scenario.id);
                const unitCount =
                  scenario.executionModel === "journey"
                    ? scenario.steps.length
                    : scenario.tests.length;
                const unitName =
                  scenario.executionModel === "journey" ? "step" : "test";
                return (
                  <Field key={scenario.id} orientation="horizontal">
                    <FieldLabel className="w-full rounded-md border p-3">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(nextChecked) => {
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (nextChecked) next.add(scenario.id);
                            else next.delete(scenario.id);
                            return next;
                          });
                        }}
                      />
                      <FieldContent>
                        <FieldTitle>{scenario.name}</FieldTitle>
                        <FieldDescription>
                          {scenario.description || "No description"} ·{" "}
                          {unitCount}{" "}
                          {unitCount === 1 ? unitName : `${unitName}s`}
                        </FieldDescription>
                      </FieldContent>
                    </FieldLabel>
                  </Field>
                );
              })}
            </FieldGroup>
          </FieldSet>
          {requiredSecretRefs.length > 0 ? (
            <section
              className="space-y-3 rounded-lg border border-amber-700/20 bg-amber-500/5 p-3 dark:border-amber-300/15"
              aria-labelledby="run-secret-heading"
            >
              <div className="flex items-start gap-2">
                <IconKey className="mt-0.5 size-4 text-amber-700 dark:text-amber-300" />
                <div>
                  <p id="run-secret-heading" className="text-sm font-medium">
                    Run secrets
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Values stay in this open Tokyo Tester session and are
                    authorized only for this run.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {requiredSecretRefs.map((secretRef) => {
                  const available =
                    sessionValues[secretRef] !== undefined &&
                    !replacing.has(secretRef);
                  return (
                    <div
                      key={secretRef}
                      className="rounded-md border bg-background/70 p-3"
                    >
                      {available ? (
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono text-xs font-semibold">
                              {secretRef}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Available this session
                            </p>
                          </div>
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReplacing((current) =>
                                  new Set(current).add(secretRef),
                                )
                              }
                            >
                              Replace
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                clearSessionSecret(scope, secretRef);
                                setDrafts((current) => {
                                  const next = { ...current };
                                  delete next[secretRef];
                                  return next;
                                });
                              }}
                            >
                              Clear
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <label
                              htmlFor={`run-secret-${secretRef}`}
                              className="font-mono text-xs font-semibold"
                            >
                              {secretRef}
                            </label>
                            {sessionValues[secretRef] !== undefined ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setReplacing((current) => {
                                    const next = new Set(current);
                                    next.delete(secretRef);
                                    return next;
                                  });
                                  setDrafts((current) => {
                                    const next = { ...current };
                                    delete next[secretRef];
                                    return next;
                                  });
                                }}
                              >
                                Keep available value
                              </Button>
                            ) : null}
                          </div>
                          <Input
                            id={`run-secret-${secretRef}`}
                            type="password"
                            autoComplete="new-password"
                            spellCheck={false}
                            value={drafts[secretRef] ?? ""}
                            onChange={(event) =>
                              setDrafts((current) => ({
                                ...current,
                                [secretRef]: event.target.value,
                              }))
                            }
                            placeholder="Enter for this session"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
        <DialogFooter className="shrink-0">
          <Button
            variant="outline"
            disabled={isExecuting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            data-testid="submit-workflow-run"
            disabled={
              selectedCount === 0 ||
              isExecuting ||
              validationErrors.length > 0 ||
              unresolvedSecretRefs.length > 0
            }
            onClick={async () => {
              const runSecrets = requiredSecretRefs.map((secretRef) => {
                const draft = drafts[secretRef];
                const value =
                  replacing.has(secretRef) ||
                  sessionValues[secretRef] === undefined
                    ? draft
                    : sessionValues[secretRef];
                if (draft) setSessionSecret(scope, secretRef, draft);
                return { secretRef, value: value ?? "" };
              });
              const accepted = await onRun([...selectedIds], runSecrets);
              if (accepted) onOpenChange(false);
            }}
          >
            {isExecuting
              ? "Starting…"
              : `Run ${selectedCount} ${selectedCount === 1 ? "scenario" : "scenarios"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
