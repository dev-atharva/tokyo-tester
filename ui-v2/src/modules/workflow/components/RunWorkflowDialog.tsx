"use client";

import {
  IconAlertTriangle,
  IconBox,
  IconShieldCheck,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
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
import { GUIDED_DOCUMENTATION } from "../lib/builder-experience";
import type {
  FlowNode,
  Scenario,
  TranslationError,
} from "../types/react-flow-cots";
import { ContextHelp, DocumentationLink } from "./BuilderHelp";

interface RunWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodes: FlowNode[];
  scenarios: Scenario[];
  validationErrors?: TranslationError[];
  isExecuting: boolean;
  onRun: (scenarioIds: string[]) => Promise<boolean>;
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

  useEffect(() => {
    if (open) setSelectedIds(new Set(scenarios.map((scenario) => scenario.id)));
  }, [open, scenarios]);

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
        <FieldSet className="min-h-0 flex-1 overflow-y-auto pr-1">
          <FieldGroup data-slot="checkbox-group">
            {scenarios.map((scenario) => {
              const checked = selectedIds.has(scenario.id);
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
                        {scenario.tests.length}{" "}
                        {scenario.tests.length === 1 ? "test" : "tests"}
                      </FieldDescription>
                    </FieldContent>
                  </FieldLabel>
                </Field>
              );
            })}
          </FieldGroup>
        </FieldSet>
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
              selectedCount === 0 || isExecuting || validationErrors.length > 0
            }
            onClick={async () => {
              const accepted = await onRun([...selectedIds]);
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
