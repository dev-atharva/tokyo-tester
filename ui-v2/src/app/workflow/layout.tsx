import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Toaster } from "@/components/ui/sonner";
import { isSetupComplete } from "@/modules/auth/server/service";

export default async function WorkflowLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

  return (
    <>
      {children}
      <Toaster />
    </>
  );
}
