import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { generateId } from "@/lib/generate-id";
import { syncService } from "@/modules/sync/sync-service";
import {
  sanitizeName,
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import { submitWorkflowRun } from "../lib/runner-client";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useRegistrySecretStore } from "../stores/registry-secret-store";
import { useScenarioStore } from "../stores/scenario.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import type {
  FlowEdge,
  FlowNode,
  Scenario,
  ValidationResult,
} from "../types/react-flow-cots";

export function selectScenariosForRun(
  scenarios: Scenario[],
  workflowId: string,
  scenarioIds?: string[],
): Scenario[] {
  if (scenarioIds === undefined) return scenarios;
  if (scenarioIds.length === 0) {
    throw new Error("Select at least one scenario to run.");
  }
  const uniqueIds = new Set(scenarioIds);
  if (uniqueIds.size !== scenarioIds.length) {
    throw new Error("Scenario selection contains duplicate IDs.");
  }
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  return scenarioIds.map((scenarioId) => {
    const scenario = byId.get(scenarioId);
    if (
      !scenario ||
      scenario.is_deleted ||
      scenario.workflowId !== workflowId
    ) {
      throw new Error(
        `Scenario ${scenarioId} is stale or does not belong to this workflow.`,
      );
    }
    return scenario;
  });
}

interface UseWorkflowExecutionProps {
  workflowId: string;
  workflowName: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  onStart?: (workflowRunId: string) => void;
  onComplete?: (result: unknown) => void;
  onError?: (error: string) => void;
}

export function useWorkflowExecution({
  workflowId,
  workflowName,
  nodes,
  edges,
  onStart,
  onComplete: _onComplete,
  onError,
}: UseWorkflowExecutionProps) {
  const router = useRouter();
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  const startExecution = useExecutionStore((state) => state.startExecution);
  const failExecution = useExecutionStore((state) => state.failExecution);
  const updateQueueInfo = useExecutionStore((state) => state.updateQueueInfo);
  const activeWorkflowRunId = useExecutionStore(
    (state) => state.activeWorkflowRunId,
  );
  const executions = useExecutionStore((state) => state.executions);
  const startScenarioRun = useScenarioRunStore(
    (state) => state.startScenarioRun,
  );
  const scenariosMap = useScenarioStore((state) => state.scenarios);
  const registrySecrets = useRegistrySecretStore(
    (state) => state.secrets[workflowId],
  );
  const activeExecution = useMemo(
    () =>
      activeWorkflowRunId ? (executions[activeWorkflowRunId] ?? null) : null,
    [activeWorkflowRunId, executions],
  );
  const scenarios = useMemo(
    () =>
      Object.values(scenariosMap)
        .filter(
          (scenario) =>
            scenario.workflowId === workflowId && !scenario.is_deleted,
        )
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [scenariosMap, workflowId],
  );
  const normalizedSecrets = useMemo(
    () =>
      Object.fromEntries(
        nodes.flatMap((node) => {
          const registry = node.data.service.registry;
          if (!registry) return [];
          const secret = registrySecrets?.[node.id];
          return [
            [
              sanitizeName(node.data.label || node.id),
              {
                url: registry.url,
                auth_type: registry.auth_type,
                username:
                  registry.auth_type === "basic" ? secret?.username : undefined,
                password:
                  registry.auth_type === "basic" ? secret?.password : undefined,
                token:
                  registry.auth_type === "token" ? secret?.token : undefined,
              },
            ] as const,
          ];
        }),
      ),
    [nodes, registrySecrets],
  );
  const validateSelection = useCallback(
    (selectedScenarios: Scenario[]) => {
      const workflowValidation = validateWorkflowGraph(nodes, edges);
      if (!workflowValidation.valid) {
        return workflowValidation;
      }

      for (const node of nodes) {
        const registry = node.data.service.registry;
        if (!registry || registry.auth_type === "none") continue;
        const runtime =
          normalizedSecrets[sanitizeName(node.data.label || node.id)];
        const missingBasic =
          registry.auth_type === "basic" &&
          (!runtime?.username?.trim() || !runtime.password);
        const missingToken = registry.auth_type === "token" && !runtime?.token;
        if (missingBasic || missingToken) {
          return {
            valid: false,
            errors: [
              {
                nodeId: node.id,
                field: "registry",
                message: `Re-enter the session-only registry credentials for “${node.data.label}” before running.`,
              },
            ],
            warnings: [],
          } satisfies ValidationResult;
        }
      }

      const serviceGraph = translateWorkflowGraphToServiceGraph(
        nodes,
        edges,
        normalizedSecrets,
      );

      if (selectedScenarios.length === 0) {
        return {
          valid: false,
          errors: [
            { message: "Create at least one scenario before executing." },
          ],
          warnings: [],
        } satisfies ValidationResult;
      }

      for (const scenario of selectedScenarios) {
        const result = validateScenario(serviceGraph, scenario);
        if (!result.valid) {
          return result;
        }
      }

      return workflowValidation;
    },
    [nodes, edges, normalizedSecrets],
  );

  const execute = useCallback(
    async (scenarioIds?: string[]) => {
      let selectedScenarios: Scenario[];
      try {
        selectedScenarios = selectScenariosForRun(
          scenarios,
          workflowId,
          scenarioIds,
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Invalid scenario selection.";
        onError?.(message);
        toast.error("Cannot start workflow", { description: message });
        return false;
      }
      const scenarioValidation = validateSelection(selectedScenarios);
      setValidationResult(scenarioValidation);
      if (!scenarioValidation.valid) {
        const errorMessages = scenarioValidation.errors
          .map((err) => err.message)
          .join("; ");
        onError?.(`Workflow validation failed: ${errorMessages}`);
        toast.error("Workflow validation failed", {
          description: errorMessages,
          duration: 7000,
        });
        console.error("[Workflow validation]", scenarioValidation.errors);
        return false;
      }

      if (
        scenarioValidation.warnings &&
        scenarioValidation.warnings.length > 0
      ) {
        console.warn("[Workflow validation]", scenarioValidation.warnings);
      }

      setIsExecuting(true);

      const workflowRunId = generateId();
      try {
        await syncService.flushPendingBeforeRun();
        if (syncService.hasBlockingPreRunChanges(workflowId)) {
          throw new Error(
            "This workflow has not been synchronized yet. Wait for sync or try Force sync before execution.",
          );
        }
        if (syncService.hasPendingPreRunChanges()) {
          const pendingCount = syncService.getPendingPreRunChanges().length;
          toast.warning("Running with unsynced local changes", {
            description: `${pendingCount} workflow/scenario change${pendingCount === 1 ? "" : "s"} could not be saved yet. The runner will use the graph currently shown on screen.`,
            duration: 7000,
          });
        }

        const scenarioRunIds = selectedScenarios.map((scenario) =>
          startScenarioRun(
            scenario.projectId,
            workflowRunId,
            workflowId,
            scenario.id,
            scenario.name,
          ),
        );

        startExecution(
          selectedScenarios[0]?.projectId ?? "",
          workflowId,
          workflowRunId,
          scenarioRunIds,
        );
        onStart?.(workflowRunId);

        const data = {
          workflowRunId,
          projectId: selectedScenarios[0]?.projectId ?? "",
          workflowId,
          workflowName,
          nodes,
          edges,
          scenarios: selectedScenarios.map((scenario, index) => ({
            id: scenario.id,
            scenarioRunId: scenarioRunIds[index],
            projectId: scenario.projectId,
            name: scenario.name,
            description: scenario.description,
            tests: scenario.tests,
            testOrder: scenario.testOrder,
            user_id: scenario.user_id,
            client_id: scenario.client_id,
          })),
          userId: selectedScenarios[0]?.user_id ?? "demo-user",
          clientId: selectedScenarios[0]?.client_id,
          registrySecrets: normalizedSecrets,
          executionOptions: {
            continueOnFailure: true,
          },
        };

        const submission = await submitWorkflowRun(data);
        updateQueueInfo(workflowRunId, submission.queue);
        const projectId = selectedScenarios[0]?.projectId ?? "";
        router.push(
          `/workflow/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(workflowRunId)}?projectId=${encodeURIComponent(projectId)}`,
        );
        return true;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        failExecution(workflowRunId, message);
        onError?.(message);
        toast.error(`Failed to start workflow: ${message}`);
        return false;
      } finally {
        setIsExecuting(false);
      }
    },
    [
      validateSelection,
      onError,
      scenarios,
      startScenarioRun,
      startExecution,
      workflowId,
      workflowName,
      nodes,
      edges,
      onStart,
      normalizedSecrets,
      router,
      failExecution,
      updateQueueInfo,
    ],
  );

  return {
    execute,
    isExecuting,
    validationResult,
    activeExecution,
    canExecute: nodes.length > 0 && scenarios.length > 0 && !isExecuting,
  };
}
