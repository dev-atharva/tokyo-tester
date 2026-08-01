"use client";

import {
  IconActivity,
  IconApi,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChecklist,
  IconDatabase,
  IconEdit,
  IconPackage,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconServer,
  IconShieldCheck,
  IconTrash,
  IconWorldWww,
} from "@tabler/icons-react";
import type { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { SyncStatusIndicator } from "@/modules/sync/SyncProvider";
import {
  type AuthoringMode,
  GUIDED_DOCUMENTATION,
  type GuidedChecklistItem,
  type GuidedStage,
} from "../lib/builder-experience";
import { getServiceRemovalImpact } from "../lib/workflow-presentation";
import type {
  EdgeData,
  FlowEdge,
  FlowNode,
  Scenario,
  ServiceType,
  TranslationError,
} from "../types/react-flow-cots";
import { AuthoringModeControl } from "./AuthoringModeControl";
import {
  BuilderHelpMenu,
  ContextHelp,
  DisabledActionHelp,
  DocumentationLink,
} from "./BuilderHelp";
import { GuidedConnections } from "./GuidedConnections";
import { GuidedSetupChecklist } from "./GuidedSetupChecklist";
import { ApacheKafkaIcon } from "./logos/KafkaIcon";
import { MariaDBIcon } from "./logos/MariadbIcon";
import { MongoDBIcon } from "./logos/MongoDBIcon";
import { MySQLIcon } from "./logos/MysqlIcon";
import { PostgreSQLIcon } from "./logos/PostgresIcon";
import { RabbitMQIcon } from "./logos/RabbitMQIcon";
import { RedisIcon } from "./logos/RedisIcon";
import { ScenarioManager } from "./ScenarioManager";

export type { GuidedStage } from "../lib/builder-experience";

interface GuidedWorkflowWorkspaceProps {
  workflowId: string;
  workflowName: string;
  provenance?: "manual" | "import" | "mcp";
  nodes: FlowNode[];
  edges: FlowEdge[];
  canEdit: boolean;
  canRun: boolean;
  runDisabledReason?: string;
  isExecuting: boolean;
  onAddService: () => void;
  onEditService: (node: FlowNode) => void;
  onRemoveService: (node: FlowNode) => void;
  scenarios: Scenario[];
  onRun: () => void;
  onViewActiveRun?: () => void;
  authoringMode: AuthoringMode;
  onAuthoringModeChange: (mode: AuthoringMode) => void;
  checklist: GuidedChecklistItem[];
  showChecklist: boolean;
  onDismissChecklist: () => void;
  onShowChecklist: () => void;
  activeStage: GuidedStage;
  onStageChange: (stage: GuidedStage) => void;
  onSaveConnection: (definition: {
    edgeId?: string;
    source: string;
    target: string;
    data: Partial<EdgeData>;
  }) => void;
  onConfirmConnection: (edgeId: string, data: EdgeData) => void;
  onDeleteConnection: (edgeId: string) => void;
  validationErrors?: TranslationError[];
}

function servicePresentation(type: ServiceType): {
  label: string;
  icon: ComponentType<{ className?: string }>;
} {
  switch (type) {
    case "generic":
      return { label: "Application", icon: IconPackage };
    case "nginx":
      return { label: "Web server", icon: IconWorldWww };
    case "mockserver":
      return { label: "Mock API", icon: IconApi };
    case "postgres":
      return { label: "Database", icon: PostgreSQLIcon };
    case "mysql":
      return { label: "Database", icon: MySQLIcon };
    case "mariadb":
      return { label: "Database", icon: MariaDBIcon };
    case "redis":
      return { label: "Cache", icon: RedisIcon };
    case "memcached":
      return { label: "Cache", icon: IconServer };
    case "kafka":
      return { label: "Message broker", icon: ApacheKafkaIcon };
    case "rabbitmq":
      return { label: "Message broker", icon: RabbitMQIcon };
    case "mongodb":
      return { label: "Document store", icon: MongoDBIcon };
    default:
      return { label: "Database", icon: IconDatabase };
  }
}

export function GuidedWorkflowWorkspace({
  workflowId,
  workflowName,
  provenance,
  nodes,
  edges,
  canEdit,
  canRun,
  runDisabledReason,
  isExecuting,
  onAddService,
  onEditService,
  onRemoveService,
  scenarios,
  onRun,
  onViewActiveRun,
  authoringMode,
  onAuthoringModeChange,
  checklist,
  showChecklist,
  onDismissChecklist,
  onShowChecklist,
  activeStage,
  onStageChange,
  onSaveConnection,
  onConfirmConnection,
  onDeleteConnection,
  validationErrors = [],
}: GuidedWorkflowWorkspaceProps) {
  const stages: GuidedStage[] = [
    "services",
    "connections",
    "scenarios",
    "review",
  ];
  const activeStageIndex = stages.indexOf(activeStage);
  const previousStage = stages[activeStageIndex - 1];
  const nextStage = stages[activeStageIndex + 1];
  const stageProgress = ((activeStageIndex + 1) / stages.length) * 100;
  const stageDetails: Record<
    GuidedStage,
    { label: string; description: string; icon: typeof IconServer }
  > = {
    services: {
      label: "Services",
      description: "Build inventory",
      icon: IconServer,
    },
    connections: {
      label: "Connections",
      description: "Define traffic",
      icon: IconRoute,
    },
    scenarios: {
      label: "Scenarios",
      description: "Author checks",
      icon: IconChecklist,
    },
    review: {
      label: "Review",
      description: "Validate and run",
      icon: IconShieldCheck,
    },
  };

  return (
    <div
      data-testid="guided-workspace"
      className="workflow-shell-enter flex size-full min-h-0 flex-col bg-background"
    >
      <header data-testid="guided-header" className="border-b bg-card/80">
        <div
          data-testid="guided-layout-rail"
          className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden size-9 shrink-0 items-center justify-center border bg-primary/8 text-primary sm:flex">
              <IconRoute className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2">
                <h1 className="truncate text-base font-semibold tracking-tight">
                  {workflowName}
                </h1>
                {provenance === "mcp" ? (
                  <Badge variant="outline">Created through MCP</Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2 text-[0.68rem] text-muted-foreground">
                <span className="font-medium tracking-wide uppercase">
                  Workflow authoring
                </span>
                <span aria-hidden="true">·</span>
                <SyncStatusIndicator compact />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <AuthoringModeControl
              value={authoringMode}
              onValueChange={onAuthoringModeChange}
            />
            <BuilderHelpMenu onShowChecklist={onShowChecklist} />
            {onViewActiveRun ? (
              <Button variant="outline" onClick={onViewActiveRun}>
                <IconActivity data-icon="inline-start" />
                View live run
              </Button>
            ) : null}
            <DisabledActionHelp
              reason={!canRun || isExecuting ? runDisabledReason : undefined}
            >
              <Button
                data-testid="guided-run-workflow"
                disabled={!canRun || isExecuting}
                onClick={onRun}
              >
                <IconPlayerPlay data-icon="inline-start" />
                {isExecuting ? "Starting…" : "Run workflow"}
              </Button>
            </DisabledActionHelp>
          </div>
        </div>
      </header>

      {validationErrors.length > 0 ? (
        <div className="border-b bg-destructive/5">
          <div
            data-testid="guided-layout-rail"
            className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 sm:px-6"
          >
            {validationErrors.map((error, index) => {
              const stage: GuidedStage = error.edgeId
                ? "connections"
                : error.field?.startsWith("tests.")
                  ? "scenarios"
                  : "services";
              return (
                <Button
                  key={`${error.field}-${index}`}
                  size="sm"
                  variant="ghost"
                  className="h-auto whitespace-normal text-left text-destructive"
                  onClick={() => onStageChange(stage)}
                >
                  {error.message}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}

      <Tabs
        value={activeStage}
        onValueChange={(value) => onStageChange(value as GuidedStage)}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
      >
        <div className="border-b bg-muted/10">
          <div
            data-testid="guided-layout-rail"
            className="mx-auto w-full max-w-[1440px] px-4 py-4 sm:px-6"
          >
            <Progress
              value={stageProgress}
              aria-label={`Guided workflow progress: step ${activeStageIndex + 1} of ${stages.length}`}
              className="sr-only"
            />
            <TabsList
              data-testid="guided-stage-tabs"
              activateOnFocus
              variant="line"
              className="grid h-12 w-full grid-cols-4 items-stretch gap-0 overflow-hidden border bg-transparent p-0 group-data-horizontal/tabs:h-12"
            >
              {stages.map((stage, index) => {
                const detail = stageDetails[stage];
                const StageIcon = detail.icon;
                const complete =
                  index < activeStageIndex ||
                  (stage === "services" && nodes.length > 0) ||
                  (stage === "connections" &&
                    edges.length > 0 &&
                    !edges.some((edge) => edge.data?.needsReview));
                return (
                  <TabsTrigger
                    key={stage}
                    value={stage}
                    aria-label={detail.label}
                    className="h-full min-w-0 justify-start border-0 border-r border-border bg-transparent px-2 py-0 after:hidden last:border-r-0 focus-visible:ring-0 focus-visible:outline-none focus-visible:[&_.stage-indicator]:opacity-100 data-active:bg-transparent data-active:shadow-none [&[data-active]_.stage-indicator]:opacity-100 sm:px-3"
                  >
                    <span
                      className="flex size-7 shrink-0 items-center justify-center border bg-muted/30 data-[complete=true]:border-primary/40 data-[complete=true]:text-primary"
                      data-complete={complete}
                    >
                      {complete ? (
                        <IconCheck className="size-3.5" />
                      ) : (
                        <StageIcon className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 text-left">
                      <span className="stage-label block truncate font-medium text-foreground">
                        {detail.label}
                      </span>
                      <span className="hidden truncate text-[0.63rem] font-normal text-muted-foreground lg:block">
                        {detail.description}
                      </span>
                    </span>
                    <span
                      data-testid="guided-stage-indicator"
                      aria-hidden="true"
                      className="stage-indicator pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary opacity-0 transition-opacity"
                    />
                  </TabsTrigger>
                );
              })}
            </TabsList>
            {showChecklist ? (
              <div className="mt-4">
                <GuidedSetupChecklist
                  items={checklist}
                  onStageChange={onStageChange}
                  onDismiss={onDismissChecklist}
                />
              </div>
            ) : null}
          </div>
        </div>

        <TabsContent
          value="services"
          className="workflow-stage-enter min-h-0 flex-1 overflow-auto"
        >
          <div
            data-testid="guided-layout-rail"
            className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6"
          >
            <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-4">
              <div>
                <p className="mb-1 text-[0.66rem] font-semibold tracking-[0.14em] text-primary uppercase">
                  Stage 1 · Environment
                </p>
                <div className="flex items-center gap-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Service inventory
                  </h2>
                  <ContextHelp label="services">
                    A service is a container Tokyo Tester provisions for this
                    workflow. Add the application under test and only the
                    infrastructure its scenarios need.
                  </ContextHelp>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add the infrastructure and applications this workflow should
                  provision.
                </p>
                <DocumentationLink href={GUIDED_DOCUMENTATION.services.href}>
                  Configure services
                </DocumentationLink>
              </div>
              {canEdit ? (
                <Button onClick={onAddService}>
                  <IconPlus data-icon="inline-start" />
                  Add service
                </Button>
              ) : null}
            </div>
            {nodes.length === 0 ? (
              <Empty className="min-h-64 border bg-muted/15">
                <EmptyHeader>
                  <EmptyMedia variant="icon" className="size-10">
                    <IconServer className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>No services configured</EmptyTitle>
                  <EmptyDescription>
                    Services run together on an isolated network while your
                    scenarios execute.
                  </EmptyDescription>
                </EmptyHeader>
                {canEdit ? (
                  <EmptyContent>
                    <Button variant="outline" onClick={onAddService}>
                      <IconPlus data-icon="inline-start" />
                      Add the first service
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {nodes.map((node, index) => {
                  const presentation = servicePresentation(
                    node.data.service.type,
                  );
                  const ServiceIcon = presentation.icon;
                  const impact = getServiceRemovalImpact(
                    node,
                    edges,
                    scenarios,
                  );
                  const ports = node.data.service.ports ?? [];
                  return (
                    <Card
                      key={node.id}
                      data-testid="guided-service-card"
                      data-service-name={node.data.label}
                      className="workflow-card-enter transition-colors duration-150 hover:border-primary/35 hover:bg-muted/10"
                      style={{ animationDelay: `${Math.min(index, 6) * 45}ms` }}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center border bg-primary/6 text-primary [&_svg]:size-5">
                              <ServiceIcon className="size-5" />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="truncate text-base">
                                {node.data.label}
                              </CardTitle>
                              <CardDescription>
                                {presentation.label}
                              </CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {node.data.service.type}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="border bg-muted/20 px-3 py-2 text-xs">
                          <div className="flex items-center gap-1 text-[0.64rem] font-medium tracking-wide text-muted-foreground uppercase">
                            Runtime image and internal ports
                            <ContextHelp label="runtime image and internal ports">
                              The image becomes a container during the run.
                              Internal ports are used by other workflow
                              services; they are not host-published ports.
                            </ContextHelp>
                          </div>
                          <p className="truncate font-mono text-[0.68rem] text-foreground">
                            {node.data.service.image || "Managed default image"}
                          </p>
                          <p className="mt-1 text-muted-foreground">
                            {ports.length} configured port
                            {ports.length === 1 ? "" : "s"}
                            {ports.length > 0
                              ? ` · ${ports
                                  .slice(0, 2)
                                  .map((port) => port.containerPort)
                                  .join(", ")}`
                              : ""}
                          </p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-[0.68rem] text-muted-foreground">
                          <span className="border-l-2 border-primary/30 pl-2">
                            <strong className="block text-sm text-foreground tabular-nums">
                              {impact.connectedEdges}
                            </strong>
                            connected edges
                          </span>
                          <span className="border-l-2 border-primary/30 pl-2">
                            <strong className="block text-sm text-foreground tabular-nums">
                              {impact.referencedTests}
                            </strong>
                            <span className="flex items-center gap-1">
                              scenario references
                              <ContextHelp label="scenario references">
                                These are test steps that target this service.
                                Removing the service preserves those steps and
                                marks them for repair.
                              </ContextHelp>
                            </span>
                          </span>
                        </div>
                      </CardContent>
                      {canEdit ? (
                        <CardFooter className="justify-end gap-2 bg-muted/10">
                          <Button
                            variant="ghost"
                            size="sm"
                            title={`Edit ${node.data.label}`}
                            onClick={() => onEditService(node)}
                          >
                            <IconEdit data-icon="inline-start" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            aria-label={`Remove ${node.data.label}`}
                            onClick={() => onRemoveService(node)}
                          >
                            <IconTrash data-icon="inline-start" />
                            Remove
                          </Button>
                        </CardFooter>
                      ) : null}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="connections"
          className="workflow-stage-enter min-h-0 flex-1 overflow-auto"
        >
          <div
            data-testid="guided-layout-rail"
            className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6"
          >
            <GuidedConnections
              nodes={nodes}
              edges={edges}
              canEdit={canEdit}
              onSave={onSaveConnection}
              onConfirm={onConfirmConnection}
              onDelete={onDeleteConnection}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="scenarios"
          className="workflow-stage-enter min-h-0 flex-1 overflow-auto"
        >
          <div
            data-testid="guided-layout-rail"
            className="mx-auto flex min-h-[36rem] w-full max-w-[1440px] flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6"
          >
            <div className="shrink-0 border-b pb-4">
              <p className="mb-1 text-[0.66rem] font-semibold tracking-[0.14em] text-primary uppercase">
                Stage 3 · Verification
              </p>
              <div className="flex items-center gap-1">
                <h2 className="text-lg font-semibold tracking-tight">
                  Scenario checks
                </h2>
                <ContextHelp label="scenarios">
                  A scenario is an ordered journey. Each test step targets a
                  service and proves one observable outcome.
                </ContextHelp>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Define the ordered assertions that prove your environment is
                behaving as expected.
              </p>
              <DocumentationLink href={GUIDED_DOCUMENTATION.scenarios.href}>
                Write effective scenarios
              </DocumentationLink>
            </div>
            <div className="min-h-0 flex-1">
              <ScenarioManager workflowId={workflowId} nodes={nodes} />
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="review"
          className="workflow-stage-enter min-h-0 flex-1 overflow-auto"
        >
          <div
            data-testid="guided-layout-rail"
            className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 sm:py-6"
          >
            <div
              data-testid="guided-review-panel"
              className="mx-auto flex w-full max-w-4xl flex-col gap-5"
            >
              <div className="border-b pb-4">
                <p className="mb-1 text-[0.66rem] font-semibold tracking-[0.14em] text-primary uppercase">
                  Stage 4 · Readiness
                </p>
                <div className="flex items-center gap-1">
                  <h2 className="text-lg font-semibold tracking-tight">
                    Review Docker workflow
                  </h2>
                  <ContextHelp label="workflow execution">
                    A run creates an isolated network, provisions the selected
                    containers, executes scenario steps in order, persists the
                    results, and cleans up managed resources.
                  </ContextHelp>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Confirm the managed resources before selecting scenarios to
                  run.
                </p>
                <div className="flex flex-wrap gap-1">
                  <DocumentationLink href={GUIDED_DOCUMENTATION.review.href}>
                    Run and debug
                  </DocumentationLink>
                  <DocumentationLink href={GUIDED_DOCUMENTATION.lifecycle.href}>
                    Execution lifecycle
                  </DocumentationLink>
                </div>
              </div>
              <div
                data-testid="guided-review-summary"
                className="grid border sm:grid-cols-3 sm:divide-x"
              >
                <div className="border-b p-4 sm:border-b-0">
                  <p className="text-xs text-muted-foreground">
                    Managed services
                  </p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {nodes.length}
                  </p>
                </div>
                <div className="border-b p-4 sm:border-b-0">
                  <p className="text-xs text-muted-foreground">Connections</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {edges.length}
                  </p>
                </div>
                <div className="p-4">
                  <p className="text-xs text-muted-foreground">
                    Validation errors
                  </p>
                  <p
                    className={cn(
                      "mt-1 text-lg font-semibold tabular-nums",
                      validationErrors.length > 0 && "text-destructive",
                    )}
                  >
                    {validationErrors.length}
                  </p>
                </div>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <IconShieldCheck /> Isolated Docker execution
                  </CardTitle>
                  <CardDescription>
                    Tokyo Tester creates a dedicated Docker network, starts the
                    services above, runs the selected scenarios, and
                    automatically removes managed containers and networks when
                    the run finishes.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DisabledActionHelp
                    reason={
                      validationErrors.length > 0
                        ? `Resolve ${validationErrors.length} validation issue${validationErrors.length === 1 ? "" : "s"} before running.`
                        : !canRun || isExecuting
                          ? runDisabledReason
                          : undefined
                    }
                  >
                    <Button
                      data-testid="guided-review-run-workflow"
                      disabled={
                        !canRun || isExecuting || validationErrors.length > 0
                      }
                      onClick={onRun}
                    >
                      <IconPlayerPlay data-icon="inline-start" />
                      {isExecuting ? "Starting…" : "Choose scenarios and run"}
                    </Button>
                  </DisabledActionHelp>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <footer
        data-testid="guided-footer"
        className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur"
      >
        <div
          data-testid="guided-layout-rail"
          className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3 px-4 py-3 sm:px-6"
        >
          <Button
            variant="outline"
            disabled={!previousStage}
            onClick={() => previousStage && onStageChange(previousStage)}
          >
            <IconArrowLeft data-icon="inline-start" />
            Back
          </Button>
          <p className="hidden text-xs text-muted-foreground sm:block">
            Step {activeStageIndex + 1} of {stages.length} ·{" "}
            {stageDetails[activeStage].description}
          </p>
          {nextStage ? (
            <Button onClick={() => onStageChange(nextStage)}>
              Continue
              <IconArrowRight data-icon="inline-end" />
            </Button>
          ) : (
            <DisabledActionHelp
              reason={!canRun || isExecuting ? runDisabledReason : undefined}
            >
              <Button
                data-testid="guided-run-workflow-footer"
                disabled={!canRun || isExecuting}
                onClick={onRun}
              >
                <IconPlayerPlay data-icon="inline-start" />
                {isExecuting ? "Starting…" : "Run workflow"}
              </Button>
            </DisabledActionHelp>
          )}
        </div>
      </footer>
    </div>
  );
}
