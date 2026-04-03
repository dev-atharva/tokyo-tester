import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthShell } from "@/modules/auth/components/auth-shell";
import { LoginForm } from "@/modules/auth/components/login-form";
import { isSetupComplete } from "@/modules/auth/server/service";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    redirectTo?: string;
    email?: string;
    setup?: string;
  }>;
}) {
  const [session, setupComplete, params] = await Promise.all([
    auth(),
    isSetupComplete(),
    searchParams,
  ]);

  if (!setupComplete) {
    redirect("/setup");
  }

  if (session?.user?.id) {
    redirect("/workflow");
  }

  const redirectTo =
    typeof params.redirectTo === "string" && params.redirectTo.startsWith("/")
      ? params.redirectTo
      : "/workflow";
  const email = typeof params.email === "string" ? params.email : undefined;
  const setupCompleteMessage =
    params.setup === "success"
      ? "Admin account created. Sign in to continue."
      : null;

  return (
    <AuthShell
      title="Sign In"
      description="Use your email and password to access Tokyo Tester."
    >
      <LoginForm
        redirectTo={redirectTo}
        initialEmail={email}
        setupMessage={setupCompleteMessage}
      />
    </AuthShell>
  );
}
