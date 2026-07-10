"use client";

import { IconGitBranch, IconRestore } from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { syncService } from "@/modules/sync/sync-service";

interface WorkflowRevision {
  id: string;
  revision_number: number;
  workflow_version: number;
  message: string;
  created_by: string;
  created_at: string;
}

interface WorkflowVersionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workflowId: string;
  projectId: string;
  workflowVersion: number;
  canEdit: boolean;
}

export function WorkflowVersionsDialog({
  open,
  onOpenChange,
  workflowId,
  projectId,
  workflowVersion,
  canEdit,
}: WorkflowVersionsDialogProps) {
  const [revisions, setRevisions] = useState<WorkflowRevision[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("Could not load workflow versions");
      const payload = (await response.json()) as {
        revisions?: WorkflowRevision[];
      };
      setRevisions(payload.revisions ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not load workflow versions",
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, workflowId]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  const saveVersion = async () => {
    setBusy(true);
    try {
      await syncService.flushPending();
      const response = await fetch(
        `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "Manual checkpoint" }),
        },
      );
      if (!response.ok) throw new Error("Could not save this version");
      toast.success("Workflow version saved");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save this version",
      );
    } finally {
      setBusy(false);
    }
  };

  const restore = async (revision: WorkflowRevision) => {
    setBusy(true);
    try {
      await syncService.flushPending();
      const response = await fetch(
        `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions/${encodeURIComponent(revision.id)}/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId, expectedVersion: workflowVersion }),
        },
      );
      if (response.status === 409)
        throw new Error(
          "The workflow changed. Reload it before restoring a version.",
        );
      if (!response.ok) throw new Error("Could not restore this version");
      const { hydrateFromServer } = await import(
        "@/modules/sync/sync-hydration"
      );
      await hydrateFromServer(true);
      toast.success(`Restored version ${revision.revision_number}`);
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not restore this version",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconGitBranch className="size-4 text-amber-500" />
            Workflow versions
          </DialogTitle>
          <DialogDescription>
            Immutable checkpoints of the workflow and all its scenarios.
            Restoring creates a new version.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[420px] pr-3">
          <div className="space-y-2">
            {loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Loading versions…
              </p>
            ) : null}
            {!loading && revisions.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                No saved versions yet.
              </div>
            ) : null}
            {revisions.map((revision, index) => (
              <div
                key={revision.id}
                className="flex items-center gap-3 rounded-md border bg-card p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      Version {revision.revision_number}
                    </span>
                    {index === 0 ? (
                      <Badge variant="secondary">Latest</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {revision.message || "Checkpoint"} ·{" "}
                    {new Date(revision.created_at).toLocaleString()}
                  </p>
                </div>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void restore(revision)}
                  >
                    <IconRestore className="mr-1.5 size-3.5" />
                    Restore
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {canEdit ? (
            <Button disabled={busy} onClick={() => void saveVersion()}>
              Save current version
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
