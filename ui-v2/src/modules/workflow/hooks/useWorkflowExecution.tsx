import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { generateId } from "@/lib/generate-id";
import { syncService } from "@/modules/sync/sync-service";
import {
  translateWorkflowGraphToServiceGraph,
  validateScenario,
  validateWorkflowGraph,
} from "@/modules/utils/scenario-translator";
import { submitWorkflowRun } from "../lib/runner-client";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useRegistrySecretStore } from "../stores/registry-secret-store";
import { useScenarioStore } from "../stores/scenario.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useUIStore } from "../stores/ui.store";
import type {
  FlowEdge,
  FlowNode,
  ValidationResult,
} from "../types/react-flow-cots";

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
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  const startExecution = useExecutionStore((state) => state.startExecution);
  const failExecution = useExecutionStore((state) => state.failExecution);
  const activeWorkflowRunId = useExecutionStore(
    (state) => state.activeWorkflowRunId,
  );
  const executions = useExecutionStore((state) => state.executions);
  const startScenarioRun = useScenarioRunStore(
    (state) => state.startScenarioRun,
  );
  const scenariosMap = useScenarioStore((state) => state.scenarios);
  const secretStore = useRegistrySecretStore.getState();
  const registrySecrets = secretStore.secrets;
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
        Object.entries(registrySecrets).map(([name, secret]) => [
          name,
          {
            ...secret,
            auth_type: secret.auth_type || "basic",
          },
        ]),
      ),
    [registrySecrets],
  );
  const openLogsDrawer = useUIStore((state) => state.openLogs);

  const scenarioValidation = useMemo(() => {
    const workflowValidation = validateWorkflowGraph(nodes, edges);
    if (!workflowValidation.valid) {
      return workflowValidation;
    }

    const serviceGraph = translateWorkflowGraphToServiceGraph(
      nodes,
      edges,
      normalizedSecrets,
    );

    if (scenarios.length === 0) {
      return {
        valid: false,
        errors: [{ message: "Create at least one scenario before executing." }],
        warnings: [],
      } satisfies ValidationResult;
    }

    for (const scenario of scenarios) {
      const result = validateScenario(serviceGraph, scenario);
      if (!result.valid) {
        return result;
      }
    }

    return workflowValidation;
  }, [nodes, edges, normalizedSecrets, scenarios]);

  const execute = useCallback(async () => {
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
      return;
    }

    if (scenarioValidation.warnings && scenarioValidation.warnings.length > 0) {
      console.warn("[Workflow validation]", scenarioValidation.warnings);
    }

    setIsExecuting(true);

    const workflowRunId = generateId();
    try {
      const scenarioRunIds = scenarios.map((scenario) =>
        startScenarioRun(
          scenario.projectId,
          workflowRunId,
          workflowId,
          scenario.id,
          scenario.name,
        ),
      );

      startExecution(
        scenarios[0]?.projectId ?? "",
        workflowId,
        workflowRunId,
        scenarioRunIds,
      );
      onStart?.(workflowRunId);

      const data = {
        workflowRunId,
        projectId: scenarios[0]?.projectId ?? "",
        workflowId,
        workflowName,
        nodes,
        edges,
        scenarios: scenarios.map((scenario, index) => ({
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
        userId: scenarios[0]?.user_id ?? "demo-user",
        clientId: scenarios[0]?.client_id,
        registrySecrets: normalizedSecrets,
        executionOptions: {
          continueOnFailure: true,
        },
      };

      await syncService.flushPending();
      if (syncService.getQueueSize() > 0) {
        throw new Error(
          "Workflow changes could not be synchronized before execution",
        );
      }
      await submitWorkflowRun(data);

      openLogsDrawer();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      failExecution(workflowRunId, message);
      onError?.(message);
      toast.error(`Failed to start workflow: ${message}`);
    } finally {
      setIsExecuting(false);
    }
  }, [
    scenarioValidation,
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
    openLogsDrawer,
    failExecution,
  ]);

  return {
    execute,
    isExecuting,
    validationResult,
    activeExecution,
    canExecute: nodes.length > 0 && scenarios.length > 0 && !isExecuting,
  };
}
