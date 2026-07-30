export type DocsSectionId =
  | "start"
  | "concepts"
  | "guides"
  | "agents"
  | "operations"
  | "architecture"
  | "reference";

export interface DocHeading {
  id: string;
  title: string;
}

export interface DocEntry {
  slug: string;
  title: string;
  summary: string;
  section: DocsSectionId;
  keywords: readonly string[];
  headings: readonly DocHeading[];
}

export interface DocsSection {
  id: DocsSectionId;
  title: string;
  description: string;
}

export const docsSections: readonly DocsSection[] = [
  {
    id: "start",
    title: "Start here",
    description: "Understand Tokyo Tester and complete a first run.",
  },
  {
    id: "concepts",
    title: "Concepts",
    description: "The mental model behind environments and execution.",
  },
  {
    id: "guides",
    title: "Build and test",
    description: "Practical guides for authoring and debugging workflows.",
  },
  {
    id: "agents",
    title: "Coding agents",
    description: "Connect agents without surrendering control of runs.",
  },
  {
    id: "operations",
    title: "Operate",
    description: "Develop, deploy, upgrade, recover, and troubleshoot.",
  },
  {
    id: "architecture",
    title: "Architecture",
    description: "How the UI, durable runner, and realtime paths cooperate.",
  },
  {
    id: "reference",
    title: "Reference",
    description: "Exact providers, executors, formats, states, and terms.",
  },
];

export const docsEntries: readonly DocEntry[] = [
  {
    slug: "start/what-is-tokyo-tester",
    title: "What is Tokyo Tester?",
    summary:
      "A plain-language tour of the problem, product, and people it serves.",
    section: "start",
    keywords: ["overview", "product", "staging", "end-to-end"],
    headings: [
      { id: "the-short-version", title: "The short version" },
      { id: "what-it-replaces", title: "What it replaces" },
      { id: "who-it-is-for", title: "Who it is for" },
      { id: "what-a-run-does", title: "What a run does" },
    ],
  },
  {
    slug: "start/philosophy",
    title: "Philosophy",
    summary:
      "Why Tokyo Tester favors isolated systems, real dependencies, and evidence.",
    section: "start",
    keywords: ["principles", "isolation", "repeatability", "local-first"],
    headings: [
      { id: "systems-over-endpoints", title: "Systems over endpoints" },
      {
        id: "isolation-over-coordination",
        title: "Isolation over coordination",
      },
      { id: "evidence-over-guesswork", title: "Evidence over guesswork" },
      { id: "automation-with-boundaries", title: "Automation with boundaries" },
    ],
  },
  {
    slug: "start/quick-start",
    title: "Quick start",
    summary:
      "Start the local stack, create the first account, and open the builder.",
    section: "start",
    keywords: ["install", "make dev", "docker", "setup"],
    headings: [
      { id: "prerequisites", title: "Prerequisites" },
      { id: "start-the-stack", title: "Start the stack" },
      { id: "first-sign-in", title: "First sign-in" },
      { id: "stop-or-reset", title: "Stop or reset" },
    ],
  },
  {
    slug: "start/first-workflow",
    title: "Build your first workflow",
    summary:
      "Model an API and PostgreSQL, run two checks, and read the result.",
    section: "start",
    keywords: ["tutorial", "workflow", "postgres", "scenario"],
    headings: [
      { id: "the-system", title: "The system" },
      { id: "build-the-graph", title: "Build the graph" },
      { id: "add-a-scenario", title: "Add a scenario" },
      { id: "run-and-read", title: "Run and read" },
    ],
  },
  {
    slug: "concepts/service-environments",
    title: "Service environments",
    summary:
      "How nodes, dependencies, networks, and readiness form an executable system.",
    section: "concepts",
    keywords: ["graph", "services", "edges", "readiness", "docker network"],
    headings: [
      {
        id: "from-diagram-to-environment",
        title: "From diagram to environment",
      },
      { id: "nodes", title: "Nodes" },
      { id: "connections", title: "Connections" },
      { id: "readiness", title: "Readiness" },
    ],
  },
  {
    slug: "concepts/workflows-scenarios-tests",
    title: "Workflows, scenarios, and tests",
    summary:
      "The three layers that describe a system and the journeys through it.",
    section: "concepts",
    keywords: ["workflow", "scenario", "test", "ordered steps"],
    headings: [
      { id: "workflow", title: "Workflow" },
      { id: "scenario", title: "Scenario" },
      { id: "test", title: "Test" },
      { id: "choosing-boundaries", title: "Choosing boundaries" },
    ],
  },
  {
    slug: "concepts/execution-lifecycle",
    title: "Execution lifecycle",
    summary: "What happens from Run to durable results and cleanup.",
    section: "concepts",
    keywords: ["run", "provision", "cleanup", "results", "lifecycle"],
    headings: [
      { id: "lifecycle-at-a-glance", title: "Lifecycle at a glance" },
      { id: "provisioning", title: "Provisioning" },
      { id: "scenario-execution", title: "Scenario execution" },
      { id: "terminal-states", title: "Terminal states" },
    ],
  },
  {
    slug: "guides/build-service-graph",
    title: "Build a service graph",
    summary: "Model runtime services, dependencies, and startup requirements.",
    section: "guides",
    keywords: ["builder", "guided", "expert", "edges", "relations"],
    headings: [
      { id: "choose-a-builder-mode", title: "Choose a builder mode" },
      { id: "add-services", title: "Add services" },
      { id: "connect-services", title: "Connect services" },
      { id: "review-the-graph", title: "Review the graph" },
    ],
  },
  {
    slug: "guides/configure-services",
    title: "Configure services and infrastructure",
    summary:
      "Images, commands, ports, health checks, environment, and registry secrets.",
    section: "guides",
    keywords: ["image", "ports", "healthcheck", "environment", "registry"],
    headings: [
      { id: "application-services", title: "Application services" },
      { id: "managed-dependency-nodes", title: "Dependency nodes" },
      { id: "health-and-startup", title: "Health and startup" },
      { id: "private-images", title: "Private images" },
    ],
  },
  {
    slug: "guides/write-scenarios",
    title: "Write scenarios",
    summary:
      "Turn user journeys and failure hypotheses into ordered test steps.",
    section: "guides",
    keywords: ["scenario", "recipes", "assertions", "steps"],
    headings: [
      { id: "start-with-an-outcome", title: "Start with an outcome" },
      { id: "use-recipes", title: "Use recipes" },
      { id: "order-the-steps", title: "Order the steps" },
      { id: "assert-what-matters", title: "Assert what matters" },
    ],
  },
  {
    slug: "guides/run-and-debug",
    title: "Run and debug",
    summary:
      "Select scenarios, follow execution, and turn failures into fixes.",
    section: "guides",
    keywords: ["execute", "logs", "diagnostics", "failure", "cancel"],
    headings: [
      { id: "before-you-run", title: "Before you run" },
      { id: "follow-the-run", title: "Follow the run" },
      { id: "read-a-failure", title: "Read a failure" },
      { id: "cancel-and-clean-up", title: "Cancel and clean up" },
    ],
  },
  {
    slug: "guides/import-export-revisions",
    title: "Import, export, and revisions",
    summary:
      "Move workflows safely and recover earlier definitions without losing history.",
    section: "guides",
    keywords: ["json", "bundle", "clone", "revision", "restore"],
    headings: [
      { id: "portable-bundles", title: "Portable bundles" },
      { id: "import-and-validation", title: "Import and validation" },
      { id: "immutable-revisions", title: "Immutable revisions" },
      { id: "restore-safely", title: "Restore safely" },
    ],
  },
  {
    slug: "guides/workspaces-permissions",
    title: "Workspaces and permissions",
    summary:
      "Separate personal and team work while controlling who can edit, run, or manage.",
    section: "guides",
    keywords: ["project", "workspace", "owner", "editor", "runner"],
    headings: [
      { id: "workspace-types", title: "Workspace types" },
      { id: "roles", title: "Roles" },
      { id: "agent-scopes", title: "Agent scopes" },
      { id: "practical-policy", title: "Practical policy" },
    ],
  },
  {
    slug: "agents/overview",
    title: "Agent integration overview",
    summary: "What the local skill and authenticated MCP server each do.",
    section: "agents",
    keywords: ["mcp", "skill", "coding agent", "repositories"],
    headings: [
      { id: "two-parts-one-boundary", title: "Two parts, one boundary" },
      { id: "what-stays-local", title: "What stays local" },
      { id: "what-mcp-can-do", title: "What MCP can do" },
      { id: "recommended-flow", title: "Recommended flow" },
    ],
  },
  {
    slug: "agents/connect",
    title: "Connect a coding agent",
    summary: "Install the skill, authorize one workspace, and verify MCP.",
    section: "agents",
    keywords: ["token", "oauth", "install", "agent setup"],
    headings: [
      { id: "choose-authentication", title: "Choose authentication" },
      { id: "open-agent-setup", title: "Open Agent setup" },
      { id: "configure-the-client", title: "Configure the client" },
      { id: "verify-access", title: "Verify access" },
    ],
  },
  {
    slug: "agents/safe-authoring",
    title: "Safe agent authoring",
    summary:
      "Research, review, validate, approve, import, run, and repair in controlled stages.",
    section: "agents",
    keywords: ["approval", "validation receipt", "idempotency", "safety"],
    headings: [
      { id: "research-first", title: "Research first" },
      { id: "review-the-plan", title: "Review the plan" },
      { id: "validate-before-mutation", title: "Validate before mutation" },
      { id: "approval-and-retries", title: "Approval and retries" },
    ],
  },
  {
    slug: "agents/mcp-reference",
    title: "MCP reference",
    summary:
      "Resources, tools, scopes, mutation rules, and durable diagnostics.",
    section: "agents",
    keywords: ["tools", "resources", "scopes", "MCP protocol"],
    headings: [
      { id: "resources", title: "Resources" },
      { id: "read-tools", title: "Read tools" },
      { id: "write-and-run-tools", title: "Write and run tools" },
      { id: "authentication-and-limits", title: "Authentication and limits" },
    ],
  },
  {
    slug: "operations/local-development",
    title: "Local development",
    summary: "Run the application and MCP adapter on a developer machine.",
    section: "operations",
    keywords: ["make dev", "agent-dev", "docker socket", "development"],
    headings: [
      { id: "canonical-start", title: "Canonical start" },
      { id: "runner-modes", title: "Runner modes" },
      { id: "agent-adapter", title: "Agent adapter" },
      { id: "daily-commands", title: "Daily commands" },
    ],
  },
  {
    slug: "operations/production",
    title: "Production deployment",
    summary:
      "Deploy the supported single-host Docker Compose topology with Caddy.",
    section: "operations",
    keywords: ["compose", "caddy", "linux", "deployment", "production"],
    headings: [
      { id: "supported-topology", title: "Supported topology" },
      { id: "prepare-the-host", title: "Prepare the host" },
      { id: "deploy-and-verify", title: "Deploy and verify" },
      { id: "kubernetes-status", title: "Kubernetes status" },
    ],
  },
  {
    slug: "operations/backup-upgrade-recovery",
    title: "Backup, upgrade, and recovery",
    summary: "Protect durable state before releases and restore deliberately.",
    section: "operations",
    keywords: ["backup", "upgrade", "restore", "incident"],
    headings: [
      { id: "what-to-protect", title: "What to protect" },
      { id: "backup", title: "Backup" },
      { id: "upgrade", title: "Upgrade" },
      { id: "recover", title: "Recover" },
    ],
  },
  {
    slug: "operations/observability",
    title: "Logs and observability",
    summary:
      "Open the private beta log UI, investigate incidents, and understand retention limits.",
    section: "operations",
    keywords: ["dozzle", "logs", "observability", "SSH tunnel", "rotation"],
    headings: [
      { id: "open-the-log-ui", title: "Open the log UI" },
      { id: "investigate-an-incident", title: "Investigate an incident" },
      {
        id: "retention-and-resource-bounds",
        title: "Retention and resource bounds",
      },
      { id: "security-boundary", title: "Security boundary" },
    ],
  },
  {
    slug: "operations/troubleshooting",
    title: "Troubleshooting",
    summary:
      "A symptom-first guide for startup, execution, connectivity, and cleanup failures.",
    section: "operations",
    keywords: ["doctor", "logs", "docker", "failure", "support"],
    headings: [
      { id: "start-with-doctor", title: "Start with doctor" },
      { id: "services-do-not-start", title: "Services do not start" },
      { id: "tests-cannot-connect", title: "Tests cannot connect" },
      { id: "runs-or-cleanup-stall", title: "Runs or cleanup stall" },
    ],
  },
  {
    slug: "architecture/system-overview",
    title: "System overview",
    summary:
      "The UI authoring plane, durable worker, runner, and persistence boundary.",
    section: "architecture",
    keywords: ["system", "UI", "runner", "MySQL", "architecture"],
    headings: [
      { id: "major-components", title: "Major components" },
      { id: "authoring-path", title: "Authoring path" },
      { id: "execution-path", title: "Execution path" },
      { id: "ownership-boundaries", title: "Ownership boundaries" },
    ],
  },
  {
    slug: "architecture/state-sync-realtime",
    title: "State, sync, and realtime",
    summary:
      "How optimistic browser state becomes durable data and reconciles live events.",
    section: "architecture",
    keywords: ["zustand", "sync", "SSE", "durable snapshot", "events"],
    headings: [
      { id: "browser-state", title: "Browser state" },
      { id: "sync-queue", title: "Sync queue" },
      { id: "realtime-fast-path", title: "Realtime fast path" },
      { id: "durable-source-of-truth", title: "Durable source of truth" },
    ],
  },
  {
    slug: "architecture/runner-durability",
    title: "Runner durability and isolation",
    summary:
      "Networks, leases, checkpoints, resource limits, cancellation, and cleanup.",
    section: "architecture",
    keywords: ["worker", "lease", "checkpoint", "docker", "limits"],
    headings: [
      { id: "durable-work", title: "Durable work" },
      { id: "per-run-isolation", title: "Per-run isolation" },
      { id: "limits-and-cancellation", title: "Limits and cancellation" },
      { id: "recovery-and-cleanup", title: "Recovery and cleanup" },
    ],
  },
  {
    slug: "architecture/security",
    title: "Security model",
    summary:
      "Workspace boundaries, transient secrets, agent authentication, and redaction.",
    section: "architecture",
    keywords: ["security", "secret", "oauth", "token", "redaction"],
    headings: [
      { id: "trust-boundaries", title: "Trust boundaries" },
      { id: "registry-credentials", title: "Registry credentials" },
      { id: "agent-authentication", title: "Agent authentication" },
      { id: "diagnostics-and-redaction", title: "Diagnostics and redaction" },
    ],
  },
  {
    slug: "reference/services",
    title: "Service reference",
    summary: "Supported application and infrastructure node types.",
    section: "reference",
    keywords: [
      "postgres",
      "mysql",
      "redis",
      "kafka",
      "rabbitmq",
      "mongodb",
      "nginx",
      "mockserver",
    ],
    headings: [
      { id: "service-types", title: "Service types" },
      { id: "generic-services", title: "Generic services" },
      { id: "dependency-services", title: "Dependency services" },
      { id: "edge-relations", title: "Edge relations" },
    ],
  },
  {
    slug: "reference/tests",
    title: "Test and assertion reference",
    summary: "Supported test executors, operations, and assertion families.",
    section: "reference",
    keywords: [
      "http",
      "database",
      "document",
      "cache",
      "queue",
      "shell",
      "delay",
    ],
    headings: [
      { id: "test-types", title: "Test types" },
      { id: "http", title: "HTTP" },
      { id: "data-and-messaging", title: "Data and messaging" },
      { id: "shell-and-delay", title: "Shell and delay" },
    ],
  },
  {
    slug: "reference/workflow-bundle",
    title: "Workflow bundle v2",
    summary:
      "The portable JSON boundary accepted by validation, import, and agent tools.",
    section: "reference",
    keywords: ["schema", "json", "contract", "bundle v2"],
    headings: [
      { id: "bundle-shape", title: "Bundle shape" },
      { id: "validation", title: "Validation" },
      { id: "portability", title: "Portability" },
      { id: "size-and-compatibility", title: "Size and compatibility" },
    ],
  },
  {
    slug: "reference/run-statuses-limits",
    title: "Run statuses and limits",
    summary:
      "Status meanings, terminal outcomes, queues, and runtime safeguards.",
    section: "reference",
    keywords: [
      "pending",
      "running",
      "failed",
      "partial_failed",
      "cleanup_failed",
    ],
    headings: [
      { id: "statuses", title: "Statuses" },
      { id: "terminal-outcomes", title: "Terminal outcomes" },
      { id: "queues-and-estimates", title: "Queues and estimates" },
      { id: "resource-guards", title: "Resource guards" },
    ],
  },
  {
    slug: "reference/glossary",
    title: "Glossary",
    summary: "The product vocabulary used throughout Tokyo Tester.",
    section: "reference",
    keywords: ["terms", "definitions", "workflow run", "scenario run"],
    headings: [
      { id: "authoring-terms", title: "Authoring terms" },
      { id: "execution-terms", title: "Execution terms" },
      { id: "platform-terms", title: "Platform terms" },
    ],
  },
];

export function getDoc(slug: string): DocEntry | undefined {
  return docsEntries.find((entry) => entry.slug === slug);
}

export function getDocsForSection(section: DocsSectionId): readonly DocEntry[] {
  return docsEntries.filter((entry) => entry.section === section);
}

export function getDocNeighbors(slug: string): {
  previous?: DocEntry;
  next?: DocEntry;
} {
  const index = docsEntries.findIndex((entry) => entry.slug === slug);
  if (index < 0) return {};
  return {
    previous: index > 0 ? docsEntries[index - 1] : undefined,
    next: index < docsEntries.length - 1 ? docsEntries[index + 1] : undefined,
  };
}

export function getSection(section: DocsSectionId): DocsSection {
  const match = docsSections.find((item) => item.id === section);
  if (!match) throw new Error(`Unknown documentation section: ${section}`);
  return match;
}

export function searchDocs(query: string): readonly DocEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return docsEntries.slice(0, 8);

  return docsEntries.filter((entry) =>
    [
      entry.title,
      entry.summary,
      ...entry.keywords,
      ...entry.headings.map((heading) => heading.title),
    ]
      .join(" ")
      .toLocaleLowerCase()
      .includes(needle),
  );
}
