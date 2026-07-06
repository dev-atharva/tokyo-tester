import type { Metadata } from "next";
import { DevelopmentAgentDocs } from "@/modules/docs/components/development-agent-docs";

export const metadata: Metadata = {
  title: "Development & production operations | Tokyo Tester",
  description:
    "Run Tokyo Tester in development, deploy it to one production server, and connect coding agents through MCP.",
};

export default function DocsPage() {
  return <DevelopmentAgentDocs />;
}
