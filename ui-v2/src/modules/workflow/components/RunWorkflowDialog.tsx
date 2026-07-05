"use client";

import { useEffect, useState } from "react";
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
import type { Scenario } from "../types/react-flow-cots";

interface RunWorkflowDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarios: Scenario[];
  isExecuting: boolean;
  onRun: (scenarioIds: string[]) => Promise<void>;
}

export function RunWorkflowDialog({
  open,
  onOpenChange,
  scenarios,
  isExecuting,
  onRun,
}: RunWorkflowDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setSelectedIds(new Set(scenarios.map((scenario) => scenario.id)));
  }, [open, scenarios]);

  const selectedCount = selectedIds.size;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose scenarios to run</DialogTitle>
          <DialogDescription>
            All scenarios are selected each time this dialog opens.
          </DialogDescription>
        </DialogHeader>
        <FieldSet className="max-h-[55vh] overflow-y-auto pr-1">
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
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={selectedCount === 0 || isExecuting}
            onClick={async () => {
              await onRun([...selectedIds]);
              onOpenChange(false);
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
