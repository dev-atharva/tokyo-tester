"use client";

import {
  IconBook2,
  IconCheck,
  IconClipboard,
  IconDatabase,
  IconKey,
  IconPlayerPlay,
  IconRefresh,
  IconRobot,
  IconRocket,
  IconShieldLock,
  IconTerminal2,
  IconWorld,
} from "@tabler/icons-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/modules/projects/project-context";

const commands = {
  start: "make dev",
  mcp: "make agent-dev",
  health: "curl http://localhost:8090/health",
  skill:
    "mkdir -p ~/agent-workspace/.agents/skills\ncp -R /path/to/tokyo-tester/.agents/skills/tokyo-tester ~/agent-workspace/.agents/skills/",
};

const productionCommands = {
  secrets:
    "cp .env.example .env\nchmod 600 .env\nopenssl rand -hex 32\nopenssl rand -base64 32",
  deploy: "make compose-check\nmake prod",
  verify:
    "docker compose --profile agent ps\ncurl -fsS https://tokyo.example.com/api/health",
  logs: "docker compose --profile agent logs -f --tail=200 runner ui mcp edge",
  upgrade:
    'git fetch --tags\nTOKYO_TESTER_RELEASE=v1.2.3\ngit checkout "$TOKYO_TESTER_RELEASE"\nmake compose-check\nmake prod',
};

export function DevelopmentAgentDocs() {
  const { activeProject } = useProjectContext();
  const [token, setToken] = useState<string | null>(null);
  const [isCreatingToken, setIsCreatingToken] = useState(false);

  const scopes = activeProject
    ? [
        "read",
        ...(activeProject.allowedActions.includes("edit")
          ? ["workflow:write"]
          : []),
        ...(activeProject.allowedActions.includes("run") ? ["run"] : []),
      ]
    : [];

  const createToken = async () => {
    if (!activeProject) return;
    setIsCreatingToken(true);
    try {
      const response = await fetch("/api/v1/agent/tokens", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Tokyo Tester coding agent",
          projectId: activeProject.id,
          scopes,
          expiresInDays: 30,
        }),
      });
      const result = (await response.json()) as {
        token?: string;
        error?: string;
      };
      if (!response.ok || !result.token) {
        throw new Error(result.error || "Could not create the agent token");
      }
      setToken(result.token);
      toast.success("Agent token created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the token",
      );
    } finally {
      setIsCreatingToken(false);
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 lg:px-8 lg:py-10">
        <header className="grid gap-5 border-b pb-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <IconBook2 className="size-4" />
              Operator guide / deployment
            </div>
            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Run Tokyo Tester locally or operate it on one production server.
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Follow the verified path for development, then use the production
              runbook for TLS, secrets, migrations, backups, upgrades, and agent
              access.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Development</Badge>
            <Badge variant="outline">Production</Badge>
            <Badge variant="secondary">Migrations automatic</Badge>
          </div>
        </header>

        <Tabs defaultValue="development">
          <TabsList variant="line">
            <TabsTrigger value="development">
              <IconTerminal2 />
              Development
            </TabsTrigger>
            <TabsTrigger value="production">
              <IconRocket />
              Production
            </TabsTrigger>
          </TabsList>

          <TabsContent value="development" className="flex flex-col gap-8 pt-3">
            <section className="grid gap-4 lg:grid-cols-3">
              <StepCard
                number="01"
                title="Start development"
                description="Docker is the canonical path. Make checks the machine and selects the correct runner mode."
                icon={IconPlayerPlay}
              >
                <CommandBlock value={commands.start} onCopy={copy} />
                <p className="text-xs leading-5 text-muted-foreground">
                  Pending UI and runner migrations run during startup. Open
                  <code className="mx-1 font-mono text-foreground">/setup</code>
                  on the first boot; use
                  <code className="mx-1 font-mono text-foreground">/login</code>
                  afterward.
                </p>
              </StepCard>

              <StepCard
                number="02"
                title="Expose local MCP"
                description="Start this after the development stack is healthy. It publishes only the agent adapter."
                icon={IconTerminal2}
              >
                <CommandBlock value={commands.mcp} onCopy={copy} />
                <CommandBlock value={commands.health} onCopy={copy} />
                <p className="text-xs leading-5 text-muted-foreground">
                  MCP URL:
                  <code className="ml-1 font-mono text-foreground">
                    http://localhost:8090/mcp
                  </code>
                </p>
              </StepCard>

              <StepCard
                number="03"
                title="Connect the agent"
                description="Add one Streamable HTTP MCP server and send the token as a Bearer authorization header."
                icon={IconRobot}
              >
                <div className="flex flex-col gap-2 rounded-none border bg-background p-3 font-mono text-xs">
                  <span>Authorization</span>
                  <span className="break-all text-muted-foreground">
                    Bearer &lt;tt_pat_token&gt;
                  </span>
                </div>
                <p className="text-xs leading-5 text-muted-foreground">
                  The coding agent reads repositories locally. MCP receives only
                  workflow data and authorized operations.
                </p>
              </StepCard>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <IconKey className="size-4 text-primary" />
                    Project-scoped agent token
                  </CardTitle>
                  <CardDescription>
                    The token inherits the permissions of your role in the
                    active workspace and expires after 30 days.
                  </CardDescription>
                  <CardAction>
                    <Badge variant={activeProject ? "secondary" : "outline"}>
                      {activeProject?.name || "No workspace"}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="flex flex-wrap gap-2">
                    {scopes.map((scope) => (
                      <Badge key={scope} variant="outline">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                  {token ? (
                    <div className="flex flex-col gap-2">
                      <div className="break-all rounded-none border bg-muted/40 p-3 font-mono text-xs">
                        {token}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Store this token now. Tokyo Tester will not display it
                        again.
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs leading-5 text-muted-foreground">
                      Select the Personal or Team workspace the agent should
                      use. Runner roles receive read and run access; editors and
                      owners can also author workflows.
                    </p>
                  )}
                </CardContent>
                <CardFooter className="justify-end gap-2">
                  {token ? (
                    <Button
                      variant="outline"
                      onClick={() => void copy(token, "Token")}
                    >
                      <IconClipboard data-icon="inline-start" />
                      Copy token
                    </Button>
                  ) : null}
                  <Button
                    disabled={!activeProject || isCreatingToken}
                    onClick={() => void createToken()}
                  >
                    <IconKey data-icon="inline-start" />
                    {isCreatingToken
                      ? "Creating…"
                      : token
                        ? "Generate another"
                        : "Generate token"}
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Install the Tokyo Tester skill</CardTitle>
                  <CardDescription>
                    Put the portable skill at the workspace root so the agent
                    knows how to discover services, author scenarios, and
                    request approval.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <CommandBlock value={commands.skill} onCopy={copy} />
                  <Separator />
                  <pre className="overflow-x-auto text-xs leading-5 text-muted-foreground">
                    {`agent-workspace/\n├── .agents/skills/tokyo-tester/\n└── repositories/\n    ├── api/\n    ├── worker/\n    ├── web/\n    ├── payments/\n    └── infrastructure/`}
                  </pre>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader>
                <CardTitle>Practical multi-repository test</CardTitle>
                <CardDescription>
                  Start the coding agent from the shared parent directory and
                  grant it read access to the repositories. Then use this
                  prompt.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
                <blockquote className="border-l-2 border-primary bg-muted/30 p-4 text-sm leading-6">
                  Inspect the repositories in this workspace and use the Tokyo
                  Tester skill. Propose a small smoke workflow, validate it
                  through MCP, show me the scenarios, and ask for approval
                  before importing or running anything.
                </blockquote>
                <ol className="flex flex-col gap-2 text-xs text-muted-foreground">
                  {[
                    "Lists the authorized workspace and permissions",
                    "Finds Compose, Dockerfiles, APIs, migrations, and tests locally",
                    "Validates before importing",
                    "Requests approval before imports and runs",
                    "Runs only selected scenarios",
                    "Reports diagnostics and the pinned workflow revision",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <p className="pb-4 text-center text-xs text-muted-foreground">
              Use <code className="font-mono text-foreground">make down</code>{" "}
              to preserve data. Use
              <code className="mx-1 font-mono text-foreground">make reset</code>
              only when you intentionally want to delete the development
              databases.
            </p>
          </TabsContent>

          <TabsContent value="production" className="pt-3">
            <ProductionDeploymentDocs onCopy={copy} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ProductionDeploymentDocs({
  onCopy,
}: {
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-8">
      <section className="grid gap-4 lg:grid-cols-3">
        <StepCard
          number="01"
          title="Public edge only"
          description="Point DNS at the server and allow 80/443. Caddy terminates TLS and routes the UI and /mcp."
          icon={IconWorld}
        >
          <Checklist
            items={[
              "A/AAAA records resolve to the server",
              "TCP 80 and 443 are open",
              "Ports 3000, 8080, and 8090 stay closed",
            ]}
          />
        </StepCard>

        <StepCard
          number="02"
          title="Protected runtime"
          description="The runner controls the host Docker daemon. Keep this single-purpose server restricted to trusted operators."
          icon={IconShieldLock}
        >
          <Checklist
            items={[
              "Deploy a pinned release or reviewed commit",
              "Protect .env with mode 600",
              "Do not colocate untrusted workloads",
            ]}
          />
        </StepCard>

        <StepCard
          number="03"
          title="Durable data"
          description="Runner and identity data live in separate persistent volumes and must be backed up as one deployment set."
          icon={IconDatabase}
        >
          <Checklist
            items={[
              "runner_data: workflows, runs, results",
              "ui_data: users, teams, tokens",
              "Retain matching encryption secrets",
            ]}
          />
        </StepCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Configure the production environment</CardTitle>
            <CardDescription>
              Generate unique secrets on the server. Replace the example domain
              everywhere with the exact public hostname.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CommandBlock value={productionCommands.secrets} onCopy={onCopy} />
            <div className="overflow-x-auto rounded-none border bg-background p-3 font-mono text-xs leading-5">
              <pre>{`APP_ENV=production
LOG_LEVEL=info
AUTH_SECRET=<hex-secret>
AUTH_TRUST_HOST=true
AUTH_URL=https://tokyo.example.com
TOKYO_TESTER_DOMAIN=tokyo.example.com
TOKYO_TESTER_PUBLIC_ORIGIN=https://tokyo.example.com
CORS_ORIGIN=https://tokyo.example.com
WORKFLOW_JOB_ENCRYPTION_KEY=<base64-secret>`}</pre>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Validate, deploy, and verify</CardTitle>
            <CardDescription>
              Both databases migrate during service startup. A normal deployment
              never needs `make reset`.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CommandBlock value={productionCommands.deploy} onCopy={onCopy} />
            <CommandBlock value={productionCommands.verify} onCopy={onCopy} />
            <CommandBlock value={productionCommands.logs} onCopy={onCopy} />
            <p className="text-xs leading-5 text-muted-foreground">
              Create the first administrator at
              <code className="mx-1 font-mono text-foreground">
                https://your-domain/setup
              </code>
              after all four services report healthy.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconDatabase className="size-4 text-primary" />
              Backup before every upgrade
            </CardTitle>
            <CardDescription>
              Stop writers briefly and archive both SQLite volumes from the same
              point in time. Store the archives and secrets encrypted off-host.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Checklist
              items={[
                "Stop MCP, UI, and runner writers",
                "Archive runner_data and ui_data",
                "Create and verify SHA-256 checksums",
                "Test restoration on another machine",
              ]}
            />
            <p className="text-xs leading-5 text-muted-foreground">
              PostgreSQL installations must use provider snapshots or
              `pg_dump`/`pg_restore`, not copied container files.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconRefresh className="size-4 text-primary" />
              Upgrade and rollback deliberately
            </CardTitle>
            <CardDescription>
              Deploy a reviewed release, watch migrations, then run one small
              smoke workflow before returning to normal concurrency.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CommandBlock value={productionCommands.upgrade} onCopy={onCopy} />
            <p className="text-xs leading-5 text-muted-foreground">
              Migrations move forward. Rolling back after a migration requires
              the pre-upgrade database backup, matching secrets, and previous
              code—not only a Git checkout.
            </p>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Production MCP boundary</CardTitle>
          <CardDescription>
            Connect agents to `https://your-domain/mcp`; never expose the MCP
            container port directly. Generate project-scoped tokens from this
            Docs page and apply least-privilege workspace roles.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
          <div className="flex flex-col gap-2 rounded-none border bg-background p-3 font-mono text-xs">
            <span>URL https://tokyo.example.com/mcp</span>
            <span className="text-muted-foreground">
              Authorization: Bearer &lt;tt_pat_token&gt;
            </span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            Project tokens are the current private-beta mechanism for trusted
            users. OAuth 2.1 protected-resource discovery is still required
            before presenting MCP as a broadly public integration.
          </p>
        </CardContent>
        <CardFooter className="justify-between gap-3">
          <Badge variant="outline">Trusted-user private beta</Badge>
          <span className="text-xs text-muted-foreground">
            Full commands: docs/production-deployment.md
          </span>
        </CardFooter>
      </Card>
    </div>
  );
}

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <IconCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function StepCard({
  number,
  title,
  description,
  icon: Icon,
  children,
}: {
  number: string;
  title: string;
  description: string;
  icon: typeof IconPlayerPlay;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
        <CardAction>
          <span className="font-mono text-xs text-muted-foreground">
            {number}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function CommandBlock({
  value,
  onCopy,
}: {
  value: string;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  return (
    <div className="group relative overflow-x-auto rounded-none border bg-background p-3 pr-10 font-mono text-xs leading-5">
      <pre>{value}</pre>
      <Button
        aria-label="Copy command"
        className="absolute right-1.5 top-1.5 opacity-70 group-hover:opacity-100"
        size="icon-sm"
        variant="ghost"
        onClick={() => void onCopy(value, "Command")}
      >
        <IconClipboard />
      </Button>
    </div>
  );
}
