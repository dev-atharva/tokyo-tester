"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { HomeLayout } from "@/modules/home/layouts/home-layout";
import { ProjectProvider } from "@/modules/projects/project-context";
import type { ProjectMembership } from "@/modules/projects/types";
import { clearAuth, setUserId } from "@/modules/sync/client-id";
import { SyncProvider } from "@/modules/sync/SyncProvider";

interface AppShellProps {
  children: ReactNode;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  projects: ProjectMembership[];
}

const AUTH_ROUTES = new Set(["/login", "/setup"]);
const PROTECTED_SHELL_PREFIXES = ["/workflow", "/admin"];

export function AppShell({
  children,
  userId,
  userName,
  userEmail,
  userRole,
  projects,
}: AppShellProps) {
  const pathname = usePathname();
  const isProtectedRoute = PROTECTED_SHELL_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (userId) {
    setUserId(userId);
  } else {
    clearAuth();
  }

  if (AUTH_ROUTES.has(pathname) || !isProtectedRoute) {
    return children;
  }

  if (!userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="text-sm text-muted-foreground">
            Loading your workspace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider userId={userId} projects={projects}>
      <HomeLayout userName={userName} userEmail={userEmail} userRole={userRole}>
        <SyncProvider
          userId={userId}
          config={{
            baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080",
            syncInterval: 3000,
            maxBatchSize: 100,
            enabled: true,
            autoStart: true,
          }}
        >
          {children}
        </SyncProvider>
      </HomeLayout>
    </ProjectProvider>
  );
}
