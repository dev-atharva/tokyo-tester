"use client";

import {
  IconAlertCircle,
  IconArrowRight,
  IconCheck,
  IconCircle,
  IconCircleDashed,
  IconX,
} from "@tabler/icons-react";
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
import type {
  ChecklistStatus,
  GuidedChecklistItem,
  GuidedStage,
} from "../lib/builder-experience";
import { GUIDED_DOCUMENTATION } from "../lib/builder-experience";
import { DocumentationLink } from "./BuilderHelp";

const statusPresentation: Record<
  ChecklistStatus,
  {
    label: string;
    variant: "default" | "secondary" | "outline" | "ghost";
    icon: typeof IconCheck;
  }
> = {
  complete: { label: "Complete", variant: "secondary", icon: IconCheck },
  optional: { label: "Optional", variant: "outline", icon: IconCircleDashed },
  review: { label: "Review", variant: "outline", icon: IconAlertCircle },
  pending: { label: "Next", variant: "ghost", icon: IconCircle },
  ready: { label: "Ready", variant: "default", icon: IconCheck },
};

export function GuidedSetupChecklist({
  items,
  onStageChange,
  onDismiss,
}: {
  items: GuidedChecklistItem[];
  onStageChange: (stage: GuidedStage) => void;
  onDismiss: () => void;
}) {
  return (
    <Card data-testid="guided-checklist" size="sm">
      <CardHeader>
        <CardTitle>First workflow checklist</CardTitle>
        <CardDescription>
          Follow the system from containers to assertions. Nothing here blocks
          you from moving between stages.
        </CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss setup checklist"
            onClick={onDismiss}
          >
            <IconX />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {items.map((item, index) => {
          const presentation = statusPresentation[item.status];
          const StatusIcon = presentation.icon;
          return (
            <Button
              key={item.stage}
              type="button"
              variant="ghost"
              data-testid={`guided-checklist-${item.stage}`}
              data-status={item.status}
              className="h-auto min-w-0 justify-start whitespace-normal border px-3 py-2.5 text-left"
              onClick={() => onStageChange(item.stage)}
            >
              <span className="flex size-7 shrink-0 items-center justify-center border bg-background">
                <StatusIcon />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate font-medium">
                    {index + 1}. {item.title}
                  </span>
                  <Badge variant={presentation.variant}>
                    {presentation.label}
                  </Badge>
                </span>
                <span className="mt-0.5 block text-[0.66rem] font-normal text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <IconArrowRight className="shrink-0" />
            </Button>
          );
        })}
        <div className="md:col-span-2 2xl:col-span-4">
          <DocumentationLink href={GUIDED_DOCUMENTATION.gettingStarted.href}>
            Follow the first-workflow tutorial
          </DocumentationLink>
        </div>
      </CardContent>
    </Card>
  );
}
