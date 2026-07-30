"use client";

import { IconAdjustments, IconListDetails } from "@tabler/icons-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AuthoringMode } from "../lib/builder-experience";
import { ContextHelp } from "./BuilderHelp";

export function AuthoringModeControl({
  value,
  onValueChange,
}: {
  value: AuthoringMode;
  onValueChange: (mode: AuthoringMode) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <ToggleGroup
        data-testid="authoring-mode-control"
        value={[value]}
        variant="outline"
        size="sm"
        spacing={0}
        onValueChange={(nextValue) => {
          const nextMode = nextValue[0] as AuthoringMode | undefined;
          if (nextMode) onValueChange(nextMode);
        }}
      >
        <ToggleGroupItem value="guided" aria-label="Guided mode">
          <IconListDetails data-icon="inline-start" />
          Guided
        </ToggleGroupItem>
        <ToggleGroupItem value="expert" aria-label="Expert mode">
          <IconAdjustments data-icon="inline-start" />
          Expert
        </ToggleGroupItem>
      </ToggleGroup>
      <ContextHelp label="builder modes">
        Guided organizes the same workflow into recommended steps. Expert shows
        the full graph and runtime controls. Switching modes never duplicates or
        discards the workflow.
      </ContextHelp>
    </div>
  );
}
