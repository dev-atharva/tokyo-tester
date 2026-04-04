"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { clearProjectScopedClientState } from "@/modules/auth/client-state";
import type { ProjectMembership } from "./types";
import { setCurrentSessionProjectId } from "./session-project";

const ACTIVE_PROJECT_KEY_PREFIX = "cots_active_project";

interface ProjectContextValue {
  projects: ProjectMembership[];
  activeProjectId: string | null;
  activeProject: ProjectMembership | null;
  setActiveProjectId: (projectId: string | null) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

function getStorageKey(userId: string) {
  return `${ACTIVE_PROJECT_KEY_PREFIX}:${userId}`;
}

interface ProjectProviderProps {
  children: ReactNode;
  userId: string | null;
  projects: ProjectMembership[];
}

export function ProjectProvider({
  children,
  userId,
  projects,
}: ProjectProviderProps) {
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setActiveProjectIdState(null);
      setCurrentSessionProjectId(null);
      return;
    }

    const storageKey = getStorageKey(userId);
    const storedProjectId =
      typeof window !== "undefined" ? localStorage.getItem(storageKey) : null;
    const nextProjectId =
      (storedProjectId &&
      projects.some((project) => project.id === storedProjectId)
        ? storedProjectId
        : projects[0]?.id) ?? null;

    setActiveProjectIdState(nextProjectId);
    setCurrentSessionProjectId(nextProjectId);

    if (typeof window !== "undefined") {
      if (nextProjectId) {
        localStorage.setItem(storageKey, nextProjectId);
      } else {
        localStorage.removeItem(storageKey);
      }
    }
  }, [projects, userId]);

  const value = useMemo<ProjectContextValue>(() => {
    const activeProject =
      projects.find((project) => project.id === activeProjectId) ?? null;

    return {
      projects,
      activeProjectId,
      activeProject,
      setActiveProjectId: async (projectId) => {
        if (!userId) {
          setActiveProjectIdState(null);
          setCurrentSessionProjectId(null);
          return;
        }

        const normalizedProjectId =
          projectId && projects.some((project) => project.id === projectId)
            ? projectId
            : null;

        await clearProjectScopedClientState();
        setActiveProjectIdState(normalizedProjectId);
        setCurrentSessionProjectId(normalizedProjectId);

        if (typeof window !== "undefined") {
          const storageKey = getStorageKey(userId);
          if (normalizedProjectId) {
            localStorage.setItem(storageKey, normalizedProjectId);
          } else {
            localStorage.removeItem(storageKey);
          }
        }
      },
    };
  }, [activeProjectId, projects, userId]);

  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error("useProjectContext must be used within ProjectProvider");
  }
  return context;
}
