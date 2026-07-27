import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AppShell } from "@/modules/auth/components/app-shell";
import { getUserById, isSetupComplete } from "@/modules/auth/server/service";
import {
  ensurePersonalProject,
  listProjectsForUser,
} from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";

export default async function ProtectedAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [session, setupComplete] = await Promise.all([
    auth(),
    isSetupComplete(),
  ]);

  if (!setupComplete) {
    redirect("/setup");
  }

  if (!session?.user?.id) {
    redirect("/login?redirectTo=/workflow");
  }

  const sessionUser = await getUserById(session.user.id);
  if (!sessionUser) {
    redirect("/login");
  }

  await ensurePersonalProject(sessionUser.id);
  const projects = await listProjectsForUser(sessionUser.id, sessionUser.role);

  return (
    <AppShell
      userId={sessionUser.id}
      userName={sessionUser.name}
      userEmail={sessionUser.email}
      userRole={sessionUser.role}
      projects={projects}
    >
      {children}
    </AppShell>
  );
}
