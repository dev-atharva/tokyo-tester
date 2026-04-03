import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSetupComplete } from "@/modules/auth/server/service";

export default async function Page() {
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

  redirect("/workflow");
}
