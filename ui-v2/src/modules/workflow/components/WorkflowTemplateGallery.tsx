"use client";

import {
  IconApi,
  IconDatabase,
  IconLoader2,
  IconTemplate,
  IconWorldWww,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  WORKFLOW_TEMPLATES,
  type WorkflowTemplate,
  type WorkflowTemplateId,
} from "../lib/workflow-templates";

const templateIcons = {
  "nginx-smoke": IconWorldWww,
  "mock-api-contract": IconApi,
  "postgres-redis-state": IconDatabase,
} satisfies Record<WorkflowTemplateId, typeof IconTemplate>;

interface WorkflowTemplateGalleryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: WorkflowTemplate) => void;
  pendingTemplateId?: WorkflowTemplateId;
}

export function WorkflowTemplateGallery({
  open,
  onOpenChange,
  onSelect,
  pendingTemplateId,
}: WorkflowTemplateGalleryProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconTemplate />
            Start from a workflow template
          </DialogTitle>
          <DialogDescription>
            Each starter includes real services and assertions you can run,
            inspect, and adapt to your own system.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="grid gap-4 p-1 md:grid-cols-3">
            {WORKFLOW_TEMPLATES.map((template) => {
              const Icon = templateIcons[template.id];
              const pending = pendingTemplateId === template.id;
              return (
                <Card
                  key={template.id}
                  size="sm"
                  className="h-full"
                  data-testid="workflow-template-card"
                  data-template-id={template.id}
                >
                  <CardHeader>
                    <div className="mb-2 flex size-9 items-center justify-center bg-muted text-foreground">
                      <Icon />
                    </div>
                    <CardTitle>{template.name}</CardTitle>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Badge variant="outline">{template.serviceSummary}</Badge>
                  </CardContent>
                  <CardFooter>
                    <Button
                      type="button"
                      className="w-full"
                      disabled={Boolean(pendingTemplateId)}
                      onClick={() => onSelect(template)}
                    >
                      {pending ? (
                        <IconLoader2
                          data-icon="inline-start"
                          className="animate-spin"
                        />
                      ) : (
                        <IconTemplate data-icon="inline-start" />
                      )}
                      {pending ? "Creating..." : "Use template"}
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
