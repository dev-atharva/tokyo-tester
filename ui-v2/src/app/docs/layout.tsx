import type { Metadata } from "next";
import type { ReactNode } from "react";
import { DocsShell } from "@/modules/docs/components/docs-shell";

export const metadata: Metadata = {
  title: {
    default: "Documentation",
    template: "%s | Tokyo Tester Docs",
  },
  description:
    "Learn how to model, run, debug, automate, and operate isolated end-to-end service environments with Tokyo Tester.",
};

export default function DocsLayout({ children }: { children: ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
