import type { ReactNode } from "react";
import { requireAdminSession } from "@/modules/auth/server/guards";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  return children;
}
