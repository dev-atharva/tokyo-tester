import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/modules/auth/components/auth-shell";
import { SetupForm } from "@/modules/auth/components/setup-form";
import { isSetupComplete } from "@/modules/auth/server/service";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [session, setupComplete] = await Promise.all([
    auth(),
    isSetupComplete(),
  ]);

  if (setupComplete) {
    redirect(session?.user?.id ? "/workflow" : "/login");
  }

  return (
    <AuthShell
      title="Initial Setup"
      description="Create the first administrator account. After setup, sign in with that account to enter the workspace."
    >
      <SetupForm redirectTo="/login" />
    </AuthShell>
  );
}
