"use client";

import { useTransition } from "react";
import { useProjectContext } from "@/modules/projects/project-context";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

export function ProjectSwitcher() {
  const [isPending, startTransition] = useTransition();
  const { projects, activeProjectId, setActiveProjectId } = useProjectContext();

  const activeProject = projects.find((p) => p.id === activeProjectId);

  if (projects.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No projects assigned
      </span>
    );
  }

  return (
    <Select
      value={activeProjectId ?? ""}
      onValueChange={(value) =>
        startTransition(async () => {
          await setActiveProjectId(value || null);
        })
      }
    >
      <SelectTrigger className="h-8 w-auto min-w-32 max-w-48 border border-amber-700/20 dark:border-amber-300/12 bg-amber-50/60 dark:bg-stone-900/60 px-3 text-sm font-medium shadow-sm focus:ring-0 focus:ring-offset-0 gap-1.5">
        <span className="truncate text-foreground">
          {isPending ? "Switching…" : (activeProject?.name ?? "Select project")}
        </span>
      </SelectTrigger>
      <SelectContent className="border-amber-700/18 dark:border-amber-300/12 bg-amber-50/95 dark:bg-stone-950/95 backdrop-blur-md shadow-lg">
        {projects.map((project) => (
          <SelectItem
            key={project.id}
            value={project.id}
            className="text-sm focus:bg-amber-500/10 dark:focus:bg-amber-300/8"
          >
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
