"use client";

import {
  IconAdjustments,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconDatabase,
  IconEdit,
  IconMessage,
  IconPackage,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconServer,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SyncStatusIndicator } from "@/modules/sync/SyncProvider";
import type {
  EdgeData,
  FlowEdge,
  FlowNode,
  ServiceType,
  TranslationError,
} from "../types/react-flow-cots";
import { GuidedConnections } from "./GuidedConnections";
import { ScenarioManager } from "./ScenarioManager";

export type GuidedStage = "services" | "connections" | "scenarios" | "review";

interface GuidedWorkflowWorkspaceProps {
  workflowId: string;
  workflowName: string;
  provenance?: "manual" | "import" | "mcp";
  nodes: FlowNode[];
  edges: FlowEdge[];
  canEdit: boolean;
  canRun: boolean;
  isExecuting: boolean;
  onAddService: () => void;
  onEditService: (node: FlowNode) => void;
  onRun: () => void;
  onOpenExpert: () => void;
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

function serviceRole(type: ServiceType) {
  switch (type) {
    case "generic":
      return { label: "Application", icon: IconPackage };
    case "redis":
    case "memcached":
      return { label: "Cache", icon: IconServer };
    case "kafka":
    case "rabbitmq":
      return { label: "Message broker", icon: IconMessage };
    case "mongodb":
      return { label: "Document store", icon: IconDatabase };
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
  isExecuting,
  onAddService,
  onEditService,
  onRun,
  onOpenExpert,
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

  return (
    <div className="flex size-full min-h-0 flex-col bg-background">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-3 sm:px-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{workflowName}</h1>
            <Badge variant="secondary">Guided</Badge>
            {provenance === "mcp" ? (
              <Badge variant="outline">Created through MCP</Badge>
            ) : null}
          </div>
          <SyncStatusIndicator />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onOpenExpert}>
            <IconAdjustments data-icon="inline-start" />
            Expert mode
          </Button>
          <Button
            data-testid="guided-run-workflow"
            disabled={!canRun || isExecuting}
            onClick={onRun}
          >
            <IconPlayerPlay data-icon="inline-start" />
            {isExecuting ? "Starting…" : "Run workflow"}
          </Button>
        </div>
      </header>

      {validationErrors.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b bg-destructive/5 px-6 py-2">
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
      ) : null}

      <Tabs
        value={activeStage}
        onValueChange={(value) => onStageChange(value as GuidedStage)}
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <div className="border-b px-3 py-2 sm:px-6">
          <TabsList
            variant="line"
            activateOnFocus
            className="w-full gap-0 sm:w-fit sm:gap-1"
          >
            <TabsTrigger value="services" className="min-w-0 px-1 sm:px-1.5">
              <IconServer className="hidden sm:block" />
              Services
              {nodes.length > 0 ? (
                <IconCheck className="hidden sm:block" />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="connections" className="min-w-0 px-1 sm:px-1.5">
              <IconRoute className="hidden sm:block" />
              Connections
              {edges.length > 0 &&
              !edges.some((edge) => edge.data?.needsReview) ? (
                <IconCheck className="hidden sm:block" />
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="scenarios" className="min-w-0 px-1 sm:px-1.5">
              <IconRoute className="hidden sm:block" />
              Scenarios
            </TabsTrigger>
            <TabsTrigger value="review" className="min-w-0 px-1 sm:px-1.5">
              <IconShieldCheck className="hidden sm:block" />
              Review
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="services"
          className="min-h-0 flex-1 overflow-auto p-3 sm:p-6"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">Service inventory</h2>
                <p className="text-xs text-muted-foreground">
                  {nodes.length} services
                </p>
              </div>
              {canEdit ? (
                <Button onClick={onAddService}>
                  <IconPlus data-icon="inline-start" />
                  Add service
                </Button>
              ) : null}
            </div>
            {nodes.length === 0 ? (
              <div className="flex min-h-64 items-center justify-center border border-dashed">
                {canEdit ? (
                  <Button variant="outline" onClick={onAddService}>
                    <IconPlus data-icon="inline-start" />
                    Add the first service
                  </Button>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No services
                  </span>
                )}
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {nodes.map((node) => {
                  const role = serviceRole(node.data.service.type);
                  const RoleIcon = role.icon;
                  return (
                    <Card key={node.id}>
                      <CardHeader>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <div className="flex size-9 shrink-0 items-center justify-center border bg-muted/40">
                              <RoleIcon />
                            </div>
                            <div className="min-w-0">
                              <CardTitle className="truncate text-sm">
                                {node.data.label}
                              </CardTitle>
                              <CardDescription>{role.label}</CardDescription>
                            </div>
                          </div>
                          <Badge variant="outline">
                            {node.data.service.type}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-muted-foreground">
                          {node.data.service.image ||
                            `${node.data.service.ports?.length ?? 0} configured ports`}
                        </span>
                        {canEdit ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            title={`Edit ${node.data.label}`}
                            onClick={() => onEditService(node)}
                          >
                            <IconEdit />
                          </Button>
                        ) : null}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent
          value="connections"
          className="min-h-0 flex-1 overflow-auto p-3 sm:p-6"
        >
          <GuidedConnections
            nodes={nodes}
            edges={edges}
            canEdit={canEdit}
            onSave={onSaveConnection}
            onConfirm={onConfirmConnection}
            onDelete={onDeleteConnection}
          />
        </TabsContent>

        <TabsContent
          value="scenarios"
          className="min-h-0 flex-1 overflow-hidden p-3 sm:p-6"
        >
          <div className="mx-auto h-full max-w-7xl">
            <ScenarioManager workflowId={workflowId} nodes={nodes} />
          </div>
        </TabsContent>

        <TabsContent
          value="review"
          className="min-h-0 flex-1 overflow-auto p-3 sm:p-6"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold">Review Docker workflow</h2>
              <p className="text-sm text-muted-foreground">
                Confirm the managed resources before selecting scenarios to run.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>Managed services</CardDescription>
                  <CardTitle>{nodes.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Connections</CardDescription>
                  <CardTitle>{edges.length}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Validation errors</CardDescription>
                  <CardTitle>{validationErrors.length}</CardTitle>
                </CardHeader>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <IconShieldCheck /> Isolated Docker execution
                </CardTitle>
                <CardDescription>
                  Tokyo Tester creates a dedicated Docker network, starts the
                  services above, runs the selected scenarios, and automatically
                  removes managed containers and networks when the run finishes.
                </CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <footer className="flex items-center justify-between gap-3 border-t px-3 py-3 sm:px-6">
        <Button
          variant="outline"
          disabled={!previousStage}
          onClick={() => previousStage && onStageChange(previousStage)}
        >
          <IconArrowLeft data-icon="inline-start" />
          Back
        </Button>
        <p className="hidden text-xs text-muted-foreground sm:block">
          Step {activeStageIndex + 1} of {stages.length}
        </p>
        {nextStage ? (
          <Button onClick={() => onStageChange(nextStage)}>
            Continue
            <IconArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            data-testid="guided-run-workflow-footer"
            disabled={!canRun || isExecuting}
            onClick={onRun}
          >
            <IconPlayerPlay data-icon="inline-start" />
            {isExecuting ? "Starting…" : "Run workflow"}
          </Button>
        )}
      </footer>
    </div>
  );
}
