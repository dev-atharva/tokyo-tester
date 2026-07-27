import type { Metadata } from "next";
import Link from "next/link";
import { AgentSetupDocs } from "@/modules/docs/components/development-agent-docs";

export const metadata: Metadata = {
  title: "Agent setup",
  description:
    "Connect a coding agent to a Tokyo Tester workspace with scoped credentials.",
};

export default function AgentSetupPage() {
  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 lg:px-8 lg:py-10">
        <header className="flex flex-col gap-3 border-b pb-8">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Project control plane
          </p>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Connect an agent to this workspace.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Generate scoped credentials, install the Tokyo Tester skill, and
            verify the MCP connection. For the complete safety and authoring
            model, read the{" "}
            <Link
              className="font-medium text-foreground underline underline-offset-4"
              href="/docs/agents/overview"
            >
              public agent guide
            </Link>
            .
          </p>
        </header>
        <AgentSetupDocs />
      </div>
    </div>
  );
}
