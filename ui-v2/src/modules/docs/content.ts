import "server-only";
import type { ComponentType } from "react";

interface DocModule {
  default: ComponentType;
}

const loaders: Record<string, () => Promise<DocModule>> = {
  "start/what-is-tokyo-tester": () =>
    import("./content/start/what-is-tokyo-tester.mdx"),
  "start/philosophy": () => import("./content/start/philosophy.mdx"),
  "start/quick-start": () => import("./content/start/quick-start.mdx"),
  "start/first-workflow": () => import("./content/start/first-workflow.mdx"),
  "concepts/service-environments": () =>
    import("./content/concepts/service-environments.mdx"),
  "concepts/workflows-scenarios-tests": () =>
    import("./content/concepts/workflows-scenarios-tests.mdx"),
  "concepts/execution-lifecycle": () =>
    import("./content/concepts/execution-lifecycle.mdx"),
  "guides/build-service-graph": () =>
    import("./content/guides/build-service-graph.mdx"),
  "guides/configure-services": () =>
    import("./content/guides/configure-services.mdx"),
  "guides/write-scenarios": () =>
    import("./content/guides/write-scenarios.mdx"),
  "guides/run-and-debug": () => import("./content/guides/run-and-debug.mdx"),
  "guides/import-export-revisions": () =>
    import("./content/guides/import-export-revisions.mdx"),
  "guides/workspaces-permissions": () =>
    import("./content/guides/workspaces-permissions.mdx"),
  "agents/overview": () => import("./content/agents/overview.mdx"),
  "agents/connect": () => import("./content/agents/connect.mdx"),
  "agents/safe-authoring": () => import("./content/agents/safe-authoring.mdx"),
  "agents/mcp-reference": () => import("./content/agents/mcp-reference.mdx"),
  "operations/local-development": () =>
    import("./content/operations/local-development.mdx"),
  "operations/production": () => import("./content/operations/production.mdx"),
  "operations/backup-upgrade-recovery": () =>
    import("./content/operations/backup-upgrade-recovery.mdx"),
  "operations/troubleshooting": () =>
    import("./content/operations/troubleshooting.mdx"),
  "architecture/system-overview": () =>
    import("./content/architecture/system-overview.mdx"),
  "architecture/state-sync-realtime": () =>
    import("./content/architecture/state-sync-realtime.mdx"),
  "architecture/runner-durability": () =>
    import("./content/architecture/runner-durability.mdx"),
  "architecture/security": () => import("./content/architecture/security.mdx"),
  "reference/services": () => import("./content/reference/services.mdx"),
  "reference/tests": () => import("./content/reference/tests.mdx"),
  "reference/workflow-bundle": () =>
    import("./content/reference/workflow-bundle.mdx"),
  "reference/run-statuses-limits": () =>
    import("./content/reference/run-statuses-limits.mdx"),
  "reference/glossary": () => import("./content/reference/glossary.mdx"),
};

export async function loadDoc(slug: string): Promise<DocModule | undefined> {
  return loaders[slug]?.();
}

export const docContentSlugs = Object.freeze(Object.keys(loaders));
