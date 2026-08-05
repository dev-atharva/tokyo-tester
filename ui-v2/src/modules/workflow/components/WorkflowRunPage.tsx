"use client";

import {
  IconActivity,
  IconAlertTriangle,
  IconArrowLeft,
  IconBolt,
  IconCheck,
  IconChevronDown,
  IconCircleCheck,
  IconCircleX,
  IconClock,
  IconInfoCircle,
  IconLoader2,
  IconPlayerStop,
  IconRefresh,
  IconRoute,
  IconServer,
  IconTerminal2,
  IconTestPipe,
  IconWaveSine,
} from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useProjectContext } from "@/modules/projects/project-context";
import { sanitizeName } from "@/modules/utils/scenario-translator";
import { useBuilderExperience } from "../hooks/useBuilderExperience";
import { useRealtimeLogs } from "../hooks/useRealtimeLogs";
import { parseBrowserJourneyResult } from "../lib/browser-journey-results";
import { isWorkflowRunActive } from "../lib/realtime-events";
import {
  cancelWorkflowRun,
  fetchWorkflowRunEventsSince,
  fetchWorkflowRunLogs,
  fetchWorkflowRunSnapshot,
  type WorkflowExecutionDefinition,
  type WorkflowRunSnapshot,
} from "../lib/runner-client";
import {
  keyLogLines,
  mergeWorkflowRunEvents,
  operationalWorkflowRunEvents,
  reconcileServiceExecutionState,
  reconcileTestExecutionStatus,
  resolveScenarioPresentationStatus,
  type ServiceExecutionState,
  type TestExecutionDisplayStatus,
  testRetryResult,
} from "../lib/workflow-run-events";
import { hydrateWorkflowRunSnapshot } from "../lib/workflow-run-snapshot";
import { useExecutionStore } from "../stores/execution.store.sync";
import { useScenarioRunStore } from "../stores/scenario-run.store.sync";
import { useTestResultStore } from "../stores/test-result.store";
import type {
  ExecutionDiagnostic,
  ScenarioRunStatus,
  ScenarioTestDefinition,
  WorkflowLogEvent,
  WorkflowRunStatus,
} from "../types/react-flow-cots";
import { AuthoringModeControl } from "./AuthoringModeControl";
import {
  BrowserJourneyResultCard,
  WorkflowJourneySummary,
} from "./BrowserJourneyResultCard";
import { ExecutionServiceMap } from "./ExecutionServiceMap";

const POLL_INTERVAL_MS = 15_000;
const STAGES = [
  "queued",
  "provision",
  "execution",
  "cleanup",
  "complete",
] as const;
type LaneStage = (typeof STAGES)[number];
type StepState = "pending" | "active" | "complete" | "failed";

const STAGE_LABELS: Record<LaneStage, string> = {
  queued: "Queued",
  provision: "Provisioning",
  execution: "Testing",
  cleanup: "Cleanup",
  complete: "Complete",
};

const DIAGNOSTIC_STAGE_LABELS: Record<ExecutionDiagnostic["stage"], string> = {
  validation: "Validation",
  translation: "Translation",
  provision: "Provisioning",
  execution: "Testing",
  cleanup: "Cleanup",
  aggregation: "Aggregation",
};

const SOURCE_LABELS: Record<ExecutionDiagnostic["source"], string> = {
  tokyo_tester: "Tokyo Tester",
  workflow_configuration: "Workflow configuration",
  service_environment: "Service environment",
  host_infrastructure: "Host infrastructure",
  undetermined: "Undetermined",
};

const TEST_STATUS_LABELS: Record<TestExecutionDisplayStatus, string> = {
  pending: "Queued",
  running: "Executing",
  passed: "Passed",
  failed: "Failed",
  not_run: "Not run",
  not_recorded: "Result unavailable",
  interrupted: "Interrupted",
};

const CODE_ACTIONS: Record<string, string[]> = {
  VALIDATION_ERROR: [
    "Return to the workflow and repair the highlighted definition.",
    "Run the affected scenario again after the revision is saved.",
  ],
  INVALID_REQUEST: [
    "Review the scenario and service fields in this immutable revision.",
    "Correct the definition in the workflow builder, then start a new run.",
  ],
  MISSING_FIELD: [
    "Add the missing configuration value in the workflow builder.",
    "Save the workflow before retrying the scenario.",
  ],
  DEPENDENCY_CYCLE_ERROR: [
    "Break the circular service or test dependency in the workflow.",
    "Confirm the revised dependency order before running again.",
  ],
  DEPENDENCY_MISSING: [
    "Restore the referenced service or test, or remove the stale dependency.",
    "Save a new workflow revision and retry.",
  ],
  REGISTRY_AUTH_ERROR: [
    "Re-enter the session-only registry credentials in the workflow builder.",
    "Confirm that the credential can pull the configured image.",
  ],
  IMAGE_PULL_ERROR: [
    "Verify the image name, tag, registry availability, and host access.",
    "Retry after registry access is restored.",
  ],
  NETWORK_CREATE_ERROR: [
    "Check Docker host capacity and network availability.",
    "Retry the run after the host condition is resolved.",
  ],
  NETWORK_CLEANUP_ERROR: [
    "Check whether the Docker host can remove the isolated run network.",
    "Report the run ID if the network remains after a retry.",
  ],
  CONTAINER_START_ERROR: [
    "Inspect the bounded container evidence below for the startup failure.",
    "Verify the image command, environment, ports, and readiness settings.",
  ],
  SERVICE_PROVISION_ERROR: [
    "Inspect the affected service evidence and readiness configuration.",
    "Reproduce with the same image and environment before changing the test.",
  ],
  TEST_EXECUTION_ERROR: [
    "Compare the assertion with the observed response in the evidence below.",
    "Inspect the targeted service logs before assigning fault.",
  ],
  TEST_TIMEOUT: [
    "Inspect service readiness and latency around the timed-out test.",
    "Adjust the timeout only if the observed behavior is expected.",
  ],
  TEST_TRANSPORT_CONNECTION_RESET: [
    "Inspect the targeted service and host around the reset before assigning fault.",
    "Retry the run after checking container restarts, readiness, and host pressure.",
  ],
  TEST_TRANSPORT_CONNECTION_REFUSED: [
    "Confirm the targeted service remained ready and listening on the configured port.",
    "Inspect container lifecycle and host capacity before retrying the run.",
  ],
  TEST_TRANSPORT_BROKEN_PIPE: [
    "Inspect the targeted service and network path for an interrupted response.",
    "Retry once after checking container restarts and host pressure.",
  ],
  TEST_TRANSPORT_CLOSED: [
    "Check whether the service or Docker network closed while the request was active.",
    "Inspect lifecycle evidence before changing the application assertion.",
  ],
  TEST_TRANSPORT_UNEXPECTED_EOF: [
    "Inspect the service response and lifecycle evidence for an incomplete connection.",
    "Retry after verifying readiness and available host resources.",
  ],
  TEST_TRANSPORT_EOF: [
    "Check whether the target closed the connection without a complete response.",
    "Inspect service and host evidence before retrying.",
  ],
  TEST_TRANSPORT_BAD_CONNECTION: [
    "Inspect the database connection and host evidence around the interruption.",
    "Retry once if the driver discarded a stale connection without other provider evidence.",
  ],
  SERVICE_CLEANUP_ERROR: [
    "Confirm the Docker host can stop and remove the listed resource.",
    "Retry cleanup or report the run ID if the resource remains allocated.",
  ],
  INTERNAL_ERROR: [
    "Retry the run once to rule out a transient worker failure.",
    "If it repeats, report this run ID with the diagnostic code.",
  ],
};

function defaultActions(diagnostic: ExecutionDiagnostic, runId: string) {
  if (diagnostic.source === "tokyo_tester") {
    return [
      "Retry the run once without changing the application services.",
      `If it repeats, report run ${runId} with code ${diagnostic.code}.`,
    ];
  }
  if (diagnostic.source === "host_infrastructure") {
    return [
      "Check Docker host capacity, networking, and external registry access.",
      "Retry after the host condition has been resolved.",
    ];
  }
  if (diagnostic.source === "service_environment") {
    return [
      "Inspect the affected service evidence before changing its configuration.",
      "Reproduce the observed behavior using the same image and environment.",
    ];
  }
  return [
    "Inspect the bounded evidence and the events immediately before the failure.",
    "Use the complete filtered logs to narrow the source before making changes.",
  ];
}

function isDiagnostic(value: unknown): value is ExecutionDiagnostic {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ExecutionDiagnostic>;
  return Boolean(
    candidate.code &&
      candidate.source &&
      candidate.confidence &&
      candidate.stage &&
      candidate.summary,
  );
}

function diagnosticsFromValue(value: unknown): ExecutionDiagnostic[] {
  if (!value || typeof value !== "object") return [];
  if (isDiagnostic(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(diagnosticsFromValue);
  const record = value as Record<string, unknown>;
  return [
    ...diagnosticsFromValue(record.diagnostic),
    ...diagnosticsFromValue(record.diagnostics),
    ...diagnosticsFromValue(record.scenarioResults),
    ...diagnosticsFromValue(record.journey),
    ...diagnosticsFromValue(record.testResults),
    ...diagnosticsFromValue(record.results),
  ];
}

function diagnosticKey(diagnostic: ExecutionDiagnostic) {
  return [
    diagnostic.code,
    diagnostic.scenarioId,
    diagnostic.testId,
    diagnostic.testName,
    diagnostic.stepId,
    diagnostic.stepName,
    diagnostic.serviceNames?.join(","),
    diagnostic.summary,
  ].join(":");
}

function formatDuration(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
}

function formatEstimate(seconds?: number) {
  if (!seconds) return "Collecting history";
  return `~${formatDuration(seconds * 1000)}`;
}

function runStatusBadge(status: WorkflowRunStatus | undefined) {
  const label = (status || "pending").replaceAll("_", " ");
  if (
    status === "failed" ||
    status === "partial_failed" ||
    status === "cleanup_failed"
  ) {
    return (
      <Badge variant="destructive" className="gap-1 capitalize">
        <IconCircleX aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge variant="outline" className="gap-1 capitalize">
        <IconCircleCheck aria-hidden="true" />
        {label}
      </Badge>
    );
  }
  if (status === "cancelled") {
    return <Badge variant="secondary">Cancelled</Badge>;
  }
  return (
    <Badge className="gap-1 capitalize">
      <IconLoader2 className="run-spin" aria-hidden="true" />
      {label}
    </Badge>
  );
}

function eventStage(event?: WorkflowLogEvent): LaneStage {
  if (!event?.stage) return "queued";
  if (event.stage === "provision") return "provision";
  if (event.stage === "execution") return "execution";
  if (event.stage === "cleanup") return "cleanup";
  if (event.stage === "aggregation") return "complete";
  return "queued";
}

function stepState(
  stage: LaneStage,
  current: LaneStage,
  failed: boolean,
  terminal: boolean,
): StepState {
  const index = STAGES.indexOf(stage);
  const currentIndex = STAGES.indexOf(current);
  if (failed) return "failed";
  if (stage === "complete" && terminal) return "complete";
  if (index < currentIndex) return "complete";
  if (index === currentIndex && !terminal) return "active";
  if (terminal && index <= currentIndex) return "complete";
  return "pending";
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "failed") return <IconCircleX aria-hidden="true" />;
  if (state === "complete") return <IconCheck aria-hidden="true" />;
  if (state === "active") {
    return <IconLoader2 className="run-spin" aria-hidden="true" />;
  }
  return <IconClock aria-hidden="true" />;
}

function testStatus(
  test: ScenarioTestDefinition,
  events: WorkflowLogEvent[],
  storedStatus?: string,
  scenarioStatus?: ScenarioRunStatus,
  workflowStatus?: WorkflowRunStatus,
): TestExecutionDisplayStatus {
  const event = [...events]
    .reverse()
    .find(
      (activity) =>
        activity.kind === "test" &&
        (activity.testId === test.id || activity.testName === test.name),
    );
  return reconcileTestExecutionStatus({
    eventStatus: event?.activityStatus,
    storedStatus,
    scenarioStatus,
    workflowStatus,
  });
}

function eventMatchesService(event: WorkflowLogEvent, serviceName: string) {
  const normalized = sanitizeName(serviceName);
  return [
    event.serviceId,
    event.serviceName,
    ...(event.serviceNames || []),
    ...(event.diagnostic?.serviceNames || []),
    ...(event.diagnostic?.evidence?.map((item) => item.serviceName) || []),
  ].some((name) => name && sanitizeName(name) === normalized);
}

export function WorkflowRunPage({
  workflowId,
  workflowRunId,
  requestedProjectId,
}: {
  workflowId: string;
  workflowRunId: string;
  requestedProjectId?: string;
}) {
  const { userId, activeProjectId, projects } = useProjectContext();
  const projectId = requestedProjectId || activeProjectId || "";
  const { mode, setMode } = useBuilderExperience(userId);
  const [snapshot, setSnapshot] = useState<WorkflowRunSnapshot | null>(null);
  const [persistedEvents, setPersistedEvents] = useState<WorkflowLogEvent[]>(
    [],
  );
  const [oldestEventId, setOldestEventId] = useState<number | undefined>();
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(
    null,
  );
  const [selectedDiagnosticKey, setSelectedDiagnosticKey] = useState<
    string | null
  >(null);
  const [selectedService, setSelectedService] = useState<string | undefined>();
  const [rawOpen, setRawOpen] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const reconciliationInFlight = useRef<Promise<void> | null>(null);
  const terminalReconciledRun = useRef<string | null>(null);
  const diagnosticSelectionInitializedRun = useRef<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const execution = useExecutionStore(
    (state) => state.executions[workflowRunId],
  );
  const updateExecutionStatus = useExecutionStore(
    (state) => state.updateExecutionStatus,
  );
  const updateReplayCursor = useExecutionStore(
    (state) => state.updateReplayCursor,
  );
  const scenarioRunsMap = useScenarioRunStore((state) => state.scenarioRuns);
  const scenarioRuns = useMemo(
    () =>
      Object.values(scenarioRunsMap).filter(
        (run) => run.workflowRunId === workflowRunId && !run.is_deleted,
      ),
    [scenarioRunsMap, workflowRunId],
  );
  const testResultsMap = useTestResultStore((state) => state.testResults);
  const testResults = useMemo(
    () =>
      Object.values(testResultsMap).filter(
        (result) =>
          result.workflowRunId === workflowRunId && !result.is_deleted,
      ),
    [testResultsMap, workflowRunId],
  );

  const refreshSnapshot = useCallback(async () => {
    if (!projectId) return;
    const nextSnapshot = await fetchWorkflowRunSnapshot(
      workflowRunId,
      projectId,
    );
    hydrateWorkflowRunSnapshot(nextSnapshot);
    setSnapshot(nextSnapshot);
  }, [projectId, workflowRunId]);

  const reconcileDurableRun = useCallback(
    async (afterInFlight = false) => {
      if (!projectId) return;
      const currentReconciliation = reconciliationInFlight.current;
      if (currentReconciliation) {
        await currentReconciliation;
        if (!afterInFlight) return;
      }

      const reconciliation = (async () => {
        const storedCursor =
          useExecutionStore.getState().executions[workflowRunId]?.lastEventId;
        const parsedCursor = Number(storedCursor || 0);
        const replay = await fetchWorkflowRunEventsSince(
          workflowRunId,
          projectId,
          Number.isSafeInteger(parsedCursor) ? parsedCursor : 0,
        );
        if (replay.events.length > 0) {
          setPersistedEvents((current) =>
            mergeWorkflowRunEvents(
              current,
              replay.events.map((item) => item.event),
            ),
          );
        }
        if (replay.newestEventId) {
          updateReplayCursor(workflowRunId, String(replay.newestEventId));
        }
        await refreshSnapshot();
      })();
      reconciliationInFlight.current = reconciliation;
      try {
        await reconciliation;
      } finally {
        if (reconciliationInFlight.current === reconciliation) {
          reconciliationInFlight.current = null;
        }
      }
    },
    [projectId, refreshSnapshot, updateReplayCursor, workflowRunId],
  );

  const loadInitialRun = useCallback(async () => {
    if (!projectId) {
      setLoadError("A project ID is required to open this workflow run.");
      setIsHydrated(true);
      return;
    }
    setLoadError(null);
    try {
      await refreshSnapshot();
      const page = await fetchWorkflowRunLogs(
        workflowRunId,
        projectId,
        undefined,
        200,
      );
      const parsed = page.events
        .map((stored) => {
          try {
            return {
              id: stored.id,
              event: JSON.parse(stored.payload) as WorkflowLogEvent,
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is { id: number; event: WorkflowLogEvent } =>
          Boolean(item),
        )
        .sort((left, right) => left.id - right.id);
      setPersistedEvents(parsed.map((item) => item.event));
      setOldestEventId(page.nextBefore ?? parsed[0]?.id);
      setHasMoreEvents(page.hasMore);
      const newestEventId = page.events.reduce(
        (newest, item) => Math.max(newest, item.id),
        0,
      );
      if (newestEventId)
        updateReplayCursor(workflowRunId, String(newestEventId));
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load this run.",
      );
    } finally {
      setIsHydrated(true);
    }
  }, [projectId, refreshSnapshot, updateReplayCursor, workflowRunId]);

  useEffect(() => {
    void loadInitialRun();
  }, [loadInitialRun]);

  useEffect(() => {
    if (!isHydrated || loadError) return;
    const frame = window.requestAnimationFrame(() => {
      headingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isHydrated, loadError]);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    setMotionEnabled(!reduced.matches);
    const respectReducedMotion = (event: MediaQueryListEvent) => {
      if (event.matches) setMotionEnabled(false);
    };
    reduced.addEventListener("change", respectReducedMotion);
    return () => reduced.removeEventListener("change", respectReducedMotion);
  }, []);

  useEffect(() => {
    if (!isWorkflowRunActive(execution?.status)) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [execution?.status]);

  const { isConnected, lastActivityAt, activities } = useRealtimeLogs({
    workflowRunId,
    projectId,
    enabled: isHydrated && !loadError,
  });

  useEffect(() => {
    if (
      !isHydrated ||
      !projectId ||
      isConnected ||
      !isWorkflowRunActive(execution?.status)
    ) {
      return;
    }
    const reconcile = () => {
      void reconcileDurableRun().catch((error) => {
        console.warn("Workflow run polling fallback failed", error);
      });
    };
    reconcile();
    const interval = window.setInterval(reconcile, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [
    execution?.status,
    isConnected,
    isHydrated,
    projectId,
    reconcileDurableRun,
  ]);

  useEffect(() => {
    if (
      !isHydrated ||
      !execution?.status ||
      isWorkflowRunActive(execution.status) ||
      terminalReconciledRun.current === workflowRunId
    ) {
      return;
    }
    terminalReconciledRun.current = workflowRunId;
    void reconcileDurableRun(true).catch((error) => {
      console.warn("Terminal workflow run reconciliation failed", error);
    });
  }, [execution?.status, isHydrated, reconcileDurableRun, workflowRunId]);

  const definition = snapshot?.executionDefinition || null;
  const rawEvents = useMemo(
    () => mergeWorkflowRunEvents(persistedEvents, activities),
    [activities, persistedEvents],
  );
  const allEvents = useMemo(
    () => operationalWorkflowRunEvents(rawEvents),
    [rawEvents],
  );

  const diagnostics = useMemo(() => {
    const candidates = [
      ...rawEvents.flatMap((event) =>
        event.diagnostic ? [event.diagnostic] : [],
      ),
      ...scenarioRuns.flatMap((run) => diagnosticsFromValue(run.result)),
      ...testResults.flatMap((result) =>
        diagnosticsFromValue(result.resultData),
      ),
      ...diagnosticsFromValue(execution?.result),
    ];
    const unique = new Map(
      candidates.map((item) => [diagnosticKey(item), item]),
    );
    return [...unique.values()];
  }, [execution?.result, rawEvents, scenarioRuns, testResults]);

  useEffect(() => {
    const scenarios = definition?.scenarios || [];
    if (
      !selectedScenarioId ||
      !scenarios.some((item) => item.id === selectedScenarioId)
    ) {
      setSelectedScenarioId(
        diagnostics.find((item) => item.scenarioId)?.scenarioId ||
          scenarios[0]?.id ||
          null,
      );
    }
  }, [definition?.scenarios, diagnostics, selectedScenarioId]);

  useEffect(() => {
    if (
      diagnostics.length === 0 ||
      diagnosticSelectionInitializedRun.current === workflowRunId
    ) {
      return;
    }
    diagnosticSelectionInitializedRun.current = workflowRunId;
    setSelectedDiagnosticKey(diagnosticKey(diagnostics[0]));
  }, [diagnostics, workflowRunId]);

  const selectedDiagnostic = diagnostics.find(
    (item) => diagnosticKey(item) === selectedDiagnosticKey,
  );
  const selectedScenario = definition?.scenarios.find(
    (scenario) => scenario.id === selectedScenarioId,
  );
  const selectedScenarioRun = scenarioRuns.find(
    (run) => run.scenarioId === selectedScenarioId,
  );
  const selectedJourneyResult = useMemo(
    () =>
      parseBrowserJourneyResult(
        selectedScenarioRun?.result ?? execution?.result,
        selectedScenarioId ?? undefined,
      ),
    [execution?.result, selectedScenarioId, selectedScenarioRun?.result],
  );
  const selectedScenarioEvents = allEvents.filter(
    (event) => !event.scenarioId || event.scenarioId === selectedScenarioId,
  );

  useEffect(() => {
    if (!selectedDiagnostic) return;
    setRawOpen(true);
    setSelectedScenarioId(
      (current) => selectedDiagnostic.scenarioId || current,
    );
    setSelectedService(selectedDiagnostic.serviceNames?.[0]);
  }, [selectedDiagnostic]);

  const serviceStates = useMemo(() => {
    const states: Record<string, ServiceExecutionState> = {};
    for (const node of definition?.workflow.nodes || []) {
      states[node.data.label] = "queued";
      states[node.data.label.toLowerCase()] = "queued";
      states[sanitizeName(node.data.label)] = "queued";
      states[node.id] = "queued";
    }
    for (const event of selectedScenarioEvents) {
      const names = [
        event.serviceId,
        event.serviceName,
        ...(event.serviceNames || []),
      ].filter((name): name is string => Boolean(name));
      for (const name of names) {
        let state: ServiceExecutionState | undefined;
        if (event.stage === "provision") {
          state =
            event.activityStatus === "failed"
              ? "failed"
              : event.activityStatus === "ready"
                ? "ready"
                : "provisioning";
        } else if (event.stage === "execution") {
          state = "testing";
        } else if (event.stage === "cleanup") {
          state =
            event.activityStatus === "failed"
              ? "failed"
              : event.activityStatus === "completed"
                ? "complete"
                : "cleaning";
        }
        if (state) {
          states[name] = state;
          states[sanitizeName(name)] = state;
        }
      }
      if (
        event.diagnostic?.source === "service_environment" &&
        event.activityStatus === "failed"
      ) {
        for (const name of event.diagnostic.serviceNames || []) {
          states[name] = "failed";
          states[sanitizeName(name)] = "failed";
        }
      }
    }
    for (const [name, state] of Object.entries(states)) {
      states[name] = reconcileServiceExecutionState(
        state,
        selectedScenarioRun?.status,
        execution?.status,
      );
    }
    return states;
  }, [
    definition?.workflow.nodes,
    execution?.status,
    selectedScenarioEvents,
    selectedScenarioRun?.status,
  ]);

  const observedServices = useMemo(
    () =>
      selectedScenarioEvents.flatMap((event) =>
        event.kind === "test" ? event.serviceNames || [] : [],
      ),
    [selectedScenarioEvents],
  );

  const canCancel =
    isWorkflowRunActive(execution?.status) &&
    projects.some(
      (project) =>
        project.id === projectId && project.allowedActions.includes("run"),
    );
  const elapsed = execution
    ? (execution.finishedAt || now) - execution.startedAt
    : 0;
  const workflowName = definition?.workflow.name || "Workflow run";

  const handleCancel = async () => {
    try {
      const result = await cancelWorkflowRun(workflowRunId, projectId);
      updateExecutionStatus(workflowRunId, result.status);
      toast.info(
        result.status === "cancelled"
          ? "Workflow cancelled"
          : "Cancellation requested; cleanup is continuing",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to cancel run",
      );
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await reconcileDurableRun();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to refresh run",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadEarlierEvents = async () => {
    if (!oldestEventId) return;
    try {
      const page = await fetchWorkflowRunLogs(
        workflowRunId,
        projectId,
        oldestEventId,
        200,
      );
      const parsed = page.events
        .map((stored) => {
          try {
            return {
              id: stored.id,
              event: JSON.parse(stored.payload) as WorkflowLogEvent,
            };
          } catch {
            return null;
          }
        })
        .filter((item): item is { id: number; event: WorkflowLogEvent } =>
          Boolean(item),
        )
        .sort((left, right) => left.id - right.id);
      setPersistedEvents((current) => [
        ...parsed.map((item) => item.event),
        ...current,
      ]);
      setOldestEventId(page.nextBefore ?? parsed[0]?.id ?? oldestEventId);
      setHasMoreEvents(page.hasMore);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load earlier events",
      );
    }
  };

  if (!isHydrated) {
    return <WorkflowRunSkeleton />;
  }

  if (loadError) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center p-6">
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Unable to open workflow run</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
          <div className="col-start-2 mt-3 flex gap-2">
            <Link
              href={`/workflow/${workflowId}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Back to workflow
            </Link>
            <Button size="sm" onClick={() => void loadInitialRun()}>
              Retry
            </Button>
          </div>
        </Alert>
      </main>
    );
  }

  return (
    <main
      data-testid="workflow-run-cockpit"
      data-motion={motionEnabled ? "enabled" : "disabled"}
      className={cn(
        "run-system-surface h-full overflow-y-auto overscroll-contain bg-background",
        motionEnabled && "run-motion-enabled",
      )}
    >
      <div className="border-b bg-background/90 backdrop-blur">
        <div className="mx-auto grid max-w-[1920px] grid-cols-[28px_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-4 py-4 lg:grid-cols-[28px_minmax(0,1fr)_auto] lg:px-6">
          <Link
            href={`/workflow/${encodeURIComponent(workflowId)}`}
            className={cn(
              buttonVariants({ variant: "ghost", size: "icon-sm" }),
              "col-start-1 row-start-1",
            )}
            aria-label="Back to workflow"
          >
            <IconArrowLeft />
          </Link>
          <div className="col-start-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Workflow run
              </p>
              <span
                data-testid="workflow-run-status"
                data-status={execution?.status || "pending"}
              >
                {runStatusBadge(execution?.status)}
              </span>
            </div>
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="mt-1 truncate text-xl font-semibold tracking-tight outline-none"
            >
              {workflowName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <code className="break-all">{workflowRunId}</code>
              {definition ? (
                <span>
                  Revision {definition.revisionNumber} · workflow v
                  {definition.workflowVersion}
                </span>
              ) : null}
            </div>
          </div>
          <div className="col-start-2 flex flex-wrap items-center gap-2 lg:col-start-3 lg:row-start-1 lg:justify-end">
            <AuthoringModeControl value={mode} onValueChange={setMode} />
            <Toggle
              variant="outline"
              size="sm"
              pressed={motionEnabled}
              onPressedChange={setMotionEnabled}
              aria-label="Toggle run motion"
            >
              <IconWaveSine data-icon="inline-start" />
              Motion
            </Toggle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={isRefreshing}
            >
              <IconRefresh
                data-icon="inline-start"
                className={cn(isRefreshing && "animate-spin")}
              />
              Refresh
            </Button>
            {canCancel ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => void handleCancel()}
              >
                <IconPlayerStop data-icon="inline-start" />
                Cancel run
              </Button>
            ) : null}
          </div>
        </div>
        <div className="mx-auto grid max-w-[1920px] grid-cols-2 border-t md:grid-cols-4 lg:px-6">
          <HeaderMetric
            label="Elapsed"
            value={formatDuration(elapsed)}
            icon={IconClock}
          />
          <HeaderMetric
            label="Connection"
            value={
              isWorkflowRunActive(execution?.status)
                ? isConnected
                  ? "Live stream"
                  : "Polling fallback"
                : "Durable snapshot"
            }
            icon={isConnected ? IconBolt : IconActivity}
          />
          <HeaderMetric
            label="Estimated run"
            value={formatEstimate(execution?.estimatedRun?.p50Seconds)}
            icon={IconRoute}
          />
          <HeaderMetric
            label="Last activity"
            value={
              lastActivityAt
                ? new Date(lastActivityAt).toLocaleTimeString()
                : "Snapshot loaded"
            }
            icon={IconWaveSine}
          />
        </div>
      </div>

      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Workflow run status: {execution?.status || "pending"}.
      </div>

      <div
        data-testid="workflow-run-content"
        className="mx-auto grid w-full max-w-[1920px] gap-4 p-4 lg:p-6"
      >
        {definition ? (
          <ScenarioSwimlanes
            definition={definition}
            scenarioRuns={scenarioRuns}
            workflowStatus={execution?.status}
            events={allEvents}
            diagnostics={diagnostics}
            selectedScenarioId={selectedScenarioId}
            onSelectScenario={(scenarioId) => {
              setSelectedScenarioId(scenarioId);
              const first = diagnostics.find(
                (item) => item.scenarioId === scenarioId,
              );
              setSelectedDiagnosticKey(first ? diagnosticKey(first) : null);
              setSelectedService(first?.serviceNames?.[0]);
            }}
          />
        ) : (
          <Alert>
            <IconInfoCircle />
            <AlertTitle>Immutable revision unavailable</AlertTitle>
            <AlertDescription>
              This legacy run can still show results and logs, but its saved
              execution graph was not available.
            </AlertDescription>
          </Alert>
        )}

        <WorkflowJourneySummary value={execution?.result} />

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
          <div className="grid min-w-0 gap-4">
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <IconServer className="size-4" />
                  {selectedScenario?.name || "Service lifecycle"}
                </CardTitle>
                <CardDescription>
                  {mode === "guided"
                    ? "Watch services move from setup to testing and safe cleanup. A targeted service is observed, not blamed, unless evidence supports it."
                    : "Immutable revision topology with typed lifecycle state and observed-at targeting."}
                </CardDescription>
                {selectedService ? (
                  <CardAction>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setSelectedService(undefined)}
                    >
                      Clear {selectedService}
                    </Button>
                  </CardAction>
                ) : null}
              </CardHeader>
              <CardContent>
                <ExecutionServiceMap
                  nodes={definition?.workflow.nodes || []}
                  edges={definition?.workflow.edges || []}
                  serviceStates={serviceStates}
                  observedServices={observedServices}
                  motionEnabled={motionEnabled}
                  selectedService={selectedService}
                  onSelectService={(serviceName) => {
                    setSelectedService(serviceName);
                    const relevant = diagnostics.find((item) =>
                      item.serviceNames?.some(
                        (name) =>
                          sanitizeName(name) === sanitizeName(serviceName),
                      ),
                    );
                    if (relevant)
                      setSelectedDiagnosticKey(diagnosticKey(relevant));
                    setRawOpen(true);
                  }}
                />
              </CardContent>
            </Card>

            {selectedScenario?.executionModel === "journey" ? (
              <BrowserJourneyResultCard
                parsed={selectedJourneyResult}
                scenarioName={selectedScenario.name}
                scenarioStatus={selectedScenarioRun?.status}
                workflowRunId={workflowRunId}
                projectId={projectId}
              />
            ) : (
              <TestOrder
                tests={selectedScenario?.tests || []}
                events={selectedScenarioEvents}
                scenarioStatus={selectedScenarioRun?.status}
                workflowStatus={execution?.status}
                testResults={testResults.filter(
                  (result) => result.scenarioId === selectedScenarioId,
                )}
                diagnostics={diagnostics}
                mode={mode}
                onSelect={(diagnostic, services) => {
                  if (diagnostic)
                    setSelectedDiagnosticKey(diagnosticKey(diagnostic));
                  setSelectedService(services[0]);
                  setRawOpen(Boolean(diagnostic));
                }}
              />
            )}

            <RawLogPanel
              open={rawOpen}
              onOpenChange={setRawOpen}
              events={rawEvents}
              plainLogs={execution?.logs || []}
              testResults={testResults}
              serviceFilter={selectedService}
              onClearFilter={() => setSelectedService(undefined)}
              hasMore={hasMoreEvents}
              onLoadEarlier={() => void loadEarlierEvents()}
              expert={mode === "expert"}
            />
          </div>

          <aside
            data-testid="workflow-run-inspector"
            aria-label="Run diagnostics and activity"
            className={cn(
              "grid min-w-0 gap-4 xl:sticky xl:top-4",
              diagnostics.length > 0
                ? "xl:h-[calc(100dvh-4.75rem)] xl:grid-rows-[minmax(0,3fr)_minmax(10rem,2fr)]"
                : "xl:max-h-[calc(100dvh-4.75rem)] xl:grid-rows-[auto_minmax(0,1fr)]",
            )}
          >
            <DiagnosticInspector
              diagnostics={diagnostics}
              selectedKey={selectedDiagnosticKey}
              runId={workflowRunId}
              definition={definition}
              mode={mode}
              onSelect={(diagnostic) => {
                setSelectedDiagnosticKey(diagnosticKey(diagnostic));
                setSelectedScenarioId(
                  diagnostic.scenarioId || selectedScenarioId,
                );
                setSelectedService(diagnostic.serviceNames?.[0]);
              }}
            />
            <ActivityInspector
              events={selectedScenarioEvents}
              expert={mode === "expert"}
              onSelect={(event) => {
                if (event.diagnostic)
                  setSelectedDiagnosticKey(diagnosticKey(event.diagnostic));
                setSelectedService(
                  event.serviceName || event.serviceNames?.[0],
                );
              }}
            />
          </aside>
        </div>
      </div>
    </main>
  );
}

function HeaderMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof IconClock;
}) {
  return (
    <div className="flex items-center gap-3 border-r px-4 py-2.5 last:border-r-0">
      <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-xs font-medium">{value}</p>
      </div>
    </div>
  );
}

function ScenarioSwimlanes({
  definition,
  scenarioRuns,
  workflowStatus,
  events,
  diagnostics,
  selectedScenarioId,
  onSelectScenario,
}: {
  definition: WorkflowExecutionDefinition;
  scenarioRuns: ReturnType<
    typeof useScenarioRunStore.getState
  >["scenarioRuns"][string][];
  workflowStatus?: WorkflowRunStatus;
  events: WorkflowLogEvent[];
  diagnostics: ExecutionDiagnostic[];
  selectedScenarioId: string | null;
  onSelectScenario: (scenarioId: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Concurrent scenarios</CardTitle>
        <CardDescription>
          Every transition below comes from a runner event or durable terminal
          state.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {definition.scenarios.map((scenario) => {
          const run = scenarioRuns.find(
            (item) => item.scenarioId === scenario.id,
          );
          const scenarioEvents = events.filter(
            (event) => event.scenarioId === scenario.id,
          );
          const latest = scenarioEvents.at(-1);
          const scenarioDiagnostics = diagnostics.filter(
            (item) => item.scenarioId === scenario.id,
          );
          const presentationStatus = resolveScenarioPresentationStatus(
            run?.status,
            workflowStatus,
          );
          const terminal = !["pending", "running", "cancelling"].includes(
            presentationStatus,
          );
          const current = terminal ? "complete" : eventStage(latest);
          return (
            <button
              key={scenario.id}
              type="button"
              data-testid="scenario-run-lane"
              data-scenario-id={scenario.id}
              data-status={presentationStatus}
              aria-pressed={selectedScenarioId === scenario.id}
              onClick={() => onSelectScenario(scenario.id)}
              className={cn(
                "grid w-full gap-3 border p-3 text-left transition-colors hover:bg-muted/30 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-center",
                selectedScenarioId === scenario.id &&
                  "border-primary bg-primary/5",
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {scenario.name}
                  </span>
                  {scenarioDiagnostics.length > 0 ? (
                    <Badge variant="destructive">
                      {scenarioDiagnostics.length} issue
                      {scenarioDiagnostics.length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scenario.executionModel === "journey"
                    ? `${scenario.steps?.length || 0} browser steps`
                    : `${scenario.tests?.length || 0} ordered tests`}
                </p>
              </div>
              <div className="grid grid-cols-5">
                {STAGES.map((stage, index) => {
                  const state = stepState(
                    stage,
                    current,
                    scenarioDiagnostics.some(
                      (diagnostic) =>
                        eventStage({
                          stage: diagnostic.stage,
                        } as WorkflowLogEvent) === stage,
                    ),
                    terminal,
                  );
                  return (
                    <div
                      key={stage}
                      data-testid="scenario-stage"
                      data-stage={stage}
                      data-state={state}
                      className="relative flex min-w-0 flex-col items-center gap-1.5 px-1"
                    >
                      {index > 0 ? (
                        <span
                          className={cn(
                            "absolute right-1/2 top-3 h-px w-full bg-border",
                            (state === "complete" || state === "active") &&
                              "bg-primary/60",
                            state === "failed" && "bg-destructive",
                          )}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative z-10 grid size-6 place-items-center border bg-background text-muted-foreground",
                          state === "active" &&
                            "run-active-stage border-primary text-primary",
                          state === "complete" &&
                            "border-primary/60 text-primary",
                          state === "failed" &&
                            "border-destructive bg-destructive text-destructive-foreground",
                        )}
                      >
                        <StepIcon state={state} />
                      </span>
                      <span className="truncate text-[9px] font-medium uppercase tracking-wide text-muted-foreground sm:text-[10px]">
                        {STAGE_LABELS[stage]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TestOrder({
  tests,
  events,
  testResults,
  scenarioStatus,
  workflowStatus,
  diagnostics,
  mode,
  onSelect,
}: {
  tests: ScenarioTestDefinition[];
  events: WorkflowLogEvent[];
  testResults: Array<{
    testName: string;
    status: string;
    resultData?: unknown;
  }>;
  scenarioStatus?: ScenarioRunStatus;
  workflowStatus?: WorkflowRunStatus;
  diagnostics: ExecutionDiagnostic[];
  mode: "guided" | "expert";
  onSelect: (
    diagnostic: ExecutionDiagnostic | undefined,
    services: string[],
  ) => void;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <IconTestPipe className="size-4" /> Test order
        </CardTitle>
        <CardDescription>
          Tests begin only when their preceding ordered work has completed.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2">
        {tests.length === 0 ? (
          <p className="border border-dashed p-4 text-center text-xs text-muted-foreground">
            No tests in this scenario revision.
          </p>
        ) : (
          tests.map((test, index) => {
            const stored = testResults.find(
              (result) => result.testName === test.name,
            );
            const status = testStatus(
              test,
              events,
              stored?.status,
              scenarioStatus,
              workflowStatus,
            );
            const diagnostic = diagnostics.find(
              (item) => item.testId === test.id || item.testName === test.name,
            );
            const latestEvent = [...events]
              .reverse()
              .find(
                (event) =>
                  event.kind === "test" &&
                  (event.testId === test.id || event.testName === test.name),
              );
            const retryResult = testRetryResult(stored?.resultData);
            const isRetrying = latestEvent?.activityStatus === "retrying";
            const statusLabel = isRetrying
              ? `Attempt ${latestEvent.attempt ?? 2} of ${latestEvent.maxAttempts ?? 2}`
              : status === "passed" && retryResult.recovered
                ? "Passed after retry"
                : status === "failed" && retryResult.attempts.length > 1
                  ? `Failed after ${retryResult.attempts.length} attempts`
                  : TEST_STATUS_LABELS[status];
            return (
              <button
                type="button"
                key={test.id}
                data-testid="test-result"
                data-test-id={test.id}
                data-status={status}
                onClick={() => onSelect(diagnostic, test.targetServices)}
                className={cn(
                  "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 border p-3 text-left hover:bg-muted/30",
                  diagnostic && "border-destructive/60",
                )}
              >
                <span className="grid size-7 place-items-center border bg-muted/40 font-mono text-[10px]">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">
                    {test.name}
                  </span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    {test.type} ·{" "}
                    {test.targetServices.length > 0
                      ? `observed at ${test.targetServices.join(", ")}`
                      : "no service target"}
                  </span>
                  {retryResult.attempts.length > 1 ? (
                    <span className="mt-1 block text-[10px] text-amber-700 dark:text-amber-400">
                      {mode === "expert"
                        ? retryResult.attempts
                            .map(
                              (attempt) =>
                                `#${attempt.attempt} ${attempt.failure_code ?? attempt.outcome} ${attempt.duration_ms}ms`,
                            )
                            .join(" · ")
                        : retryResult.recovered
                          ? "Recovered from one transient connection interruption."
                          : "The transient interruption continued after one retry."}
                    </span>
                  ) : null}
                </span>
                <Badge
                  variant={status === "failed" ? "destructive" : "outline"}
                  className="gap-1 capitalize"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {retryResult.recovered ? (
                    <IconRefresh />
                  ) : status === "passed" ? (
                    <IconCheck />
                  ) : status === "failed" ? (
                    <IconCircleX />
                  ) : status === "running" ? (
                    <IconLoader2 className="run-spin" />
                  ) : status === "interrupted" || status === "not_recorded" ? (
                    <IconAlertTriangle />
                  ) : (
                    <IconClock />
                  )}
                  {statusLabel}
                </Badge>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function DiagnosticInspector({
  diagnostics,
  selectedKey,
  runId,
  definition,
  mode,
  onSelect,
}: {
  diagnostics: ExecutionDiagnostic[];
  selectedKey: string | null;
  runId: string;
  definition: WorkflowExecutionDefinition | null;
  mode: "guided" | "expert";
  onSelect: (diagnostic: ExecutionDiagnostic) => void;
}) {
  const selected =
    diagnostics.find((item) => diagnosticKey(item) === selectedKey) ||
    diagnostics[0];
  const scenario = definition?.scenarios.find(
    (item) => item.id === selected?.scenarioId,
  );
  const path = selected
    ? [
        scenario?.name || "Workflow",
        DIAGNOSTIC_STAGE_LABELS[selected.stage],
        selected.serviceNames?.[0] || selected.testName,
      ]
        .filter(Boolean)
        .join(" → ")
    : "";
  const actions = selected
    ? CODE_ACTIONS[selected.code] || defaultActions(selected, runId)
    : [];

  return (
    <Card
      data-testid="workflow-run-diagnostics"
      className={cn(diagnostics.length > 0 && "xl:min-h-0")}
    >
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <IconAlertTriangle className="size-4" /> Diagnostics
        </CardTitle>
        <CardDescription>
          {mode === "guided"
            ? "What happened, where it happened, and what to try next."
            : "Typed source classification with confidence and bounded evidence."}
        </CardDescription>
        <CardAction>
          <Badge variant={diagnostics.length > 0 ? "destructive" : "outline"}>
            {diagnostics.length}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent
        data-testid="workflow-run-diagnostic-body"
        role={diagnostics.length > 0 ? "region" : undefined}
        aria-label={diagnostics.length > 0 ? "Diagnostic details" : undefined}
        tabIndex={diagnostics.length > 0 ? 0 : undefined}
        className="grid gap-3 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-gutter:stable]"
      >
        {diagnostics.length === 0 ? (
          <div className="flex items-start gap-3 border border-dashed p-4">
            <IconCircleCheck className="mt-0.5 size-4 text-primary" />
            <div>
              <p className="text-xs font-medium">
                No structured failures reported
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Lifecycle and test events remain available below.
              </p>
            </div>
          </div>
        ) : (
          <>
            {diagnostics.length > 1 ? (
              <div className="flex flex-wrap gap-1.5">
                {diagnostics.map((diagnostic, index) => (
                  <Button
                    key={diagnosticKey(diagnostic)}
                    variant={
                      diagnosticKey(diagnostic) === diagnosticKey(selected)
                        ? "default"
                        : "outline"
                    }
                    size="xs"
                    onClick={() => onSelect(diagnostic)}
                  >
                    Issue {index + 1} · {diagnostic.stage}
                  </Button>
                ))}
              </div>
            ) : null}
            {selected ? (
              <div
                data-testid="execution-diagnostic"
                data-diagnostic-code={selected.code}
                data-source={selected.source}
                className="grid gap-3 border border-destructive/50 bg-destructive/5 p-3"
              >
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                    {path}
                  </p>
                  <p className="mt-2 text-sm font-semibold">
                    {selected.summary}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="destructive">
                    Likely source: {SOURCE_LABELS[selected.source]}
                  </Badge>
                  <Badge variant="outline">
                    {selected.confidence} confidence
                  </Badge>
                  {mode === "expert" ? (
                    <Badge variant="outline">{selected.code}</Badge>
                  ) : null}
                </div>
                <Separator />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    What to try next
                  </p>
                  <ol className="mt-2 grid gap-2">
                    {actions.map((action, index) => (
                      <li key={action} className="flex gap-2 text-xs">
                        <span className="font-mono text-muted-foreground">
                          {index + 1}.
                        </span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ol>
                </div>
                {selected.evidence?.length ? (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Evidence
                    </p>
                    <div className="mt-2 grid gap-2">
                      {selected.evidence.map((evidence, index) => (
                        <div
                          key={`${evidence.kind}:${index}`}
                          className="border bg-background p-2"
                        >
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">
                              {evidence.kind.replaceAll("_", " ")}
                            </Badge>
                            {evidence.serviceName ? (
                              <Badge variant="secondary">
                                {evidence.serviceName}
                              </Badge>
                            ) : null}
                          </div>
                          <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed">
                            {evidence.message}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {mode === "expert" ? (
                  <div className="border-t pt-2 font-mono text-[10px] text-muted-foreground">
                    run={runId} · stage={selected.stage} · source=
                    {selected.source}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityInspector({
  events,
  expert,
  onSelect,
}: {
  events: WorkflowLogEvent[];
  expert: boolean;
  onSelect: (event: WorkflowLogEvent) => void;
}) {
  const structured = events
    .filter((event) => event.stage || event.kind)
    .slice(-12)
    .reverse();
  return (
    <Card data-testid="workflow-run-activity" className="xl:min-h-0">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <IconActivity className="size-4" /> Activity
        </CardTitle>
        <CardDescription>
          Recent structured runner events for the selected scenario.
        </CardDescription>
      </CardHeader>
      <CardContent className="xl:min-h-0 xl:flex-1">
        <ScrollArea className="h-64 xl:h-full">
          <div className="grid gap-1 pr-3">
            {structured.length === 0 ? (
              <p className="border border-dashed p-3 text-xs text-muted-foreground">
                Waiting for structured activity.
              </p>
            ) : (
              structured.map((event) => (
                <button
                  key={`${event.timestamp}:${event.sequence}:${event.kind}`}
                  type="button"
                  onClick={() => onSelect(event)}
                  className="grid grid-cols-[18px_minmax(0,1fr)] gap-2 border-l-2 border-border px-2 py-2 text-left hover:bg-muted/30"
                >
                  <span
                    className={cn(
                      "mt-0.5 size-2 bg-muted-foreground",
                      event.activityStatus === "failed" && "bg-destructive",
                      event.activityStatus === "retrying" && "bg-amber-500",
                      (event.activityStatus === "started" ||
                        event.activityStatus === "running") &&
                        "run-activity-dot bg-primary",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-xs">{event.message}</span>
                    <span className="mt-0.5 block font-mono text-[9px] text-muted-foreground">
                      {expert
                        ? `${new Date(event.timestamp).toLocaleTimeString()} · #${event.sequence} · `
                        : ""}
                      {event.stage || "event"} / {event.kind || "log"}
                      {expert && event.attempt
                        ? ` · attempt ${event.attempt}/${event.maxAttempts ?? 2}${event.retryReason ? ` · ${event.retryReason}` : ""}`
                        : ""}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function RawLogPanel({
  open,
  onOpenChange,
  events,
  plainLogs,
  testResults,
  serviceFilter,
  onClearFilter,
  hasMore,
  onLoadEarlier,
  expert,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  events: WorkflowLogEvent[];
  plainLogs: string[];
  testResults: Array<{ containerLogs?: Record<string, string> }>;
  serviceFilter?: string;
  onClearFilter: () => void;
  hasMore: boolean;
  onLoadEarlier: () => void;
  expert: boolean;
}) {
  const filteredEvents = serviceFilter
    ? events.filter((event) => eventMatchesService(event, serviceFilter))
    : events;
  const containerLogs = testResults.flatMap((result) =>
    Object.entries(result.containerLogs || {}).filter(
      ([name]) =>
        !serviceFilter || sanitizeName(name) === sanitizeName(serviceFilter),
    ),
  );
  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <IconTerminal2 className="size-4" /> Raw logs
          </CardTitle>
          <CardDescription>
            Complete runner output remains available for investigation.
          </CardDescription>
          <CardAction>
            <CollapsibleTrigger render={<Button variant="outline" size="sm" />}>
              {open ? "Hide" : "Show"} logs{" "}
              <IconChevronDown
                className={cn("transition-transform", open && "rotate-180")}
              />
            </CollapsibleTrigger>
          </CardAction>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {serviceFilter ? (
                <Badge variant="secondary">Filtered: {serviceFilter}</Badge>
              ) : (
                <Badge variant="outline">All services</Badge>
              )}
              {serviceFilter ? (
                <Button variant="ghost" size="xs" onClick={onClearFilter}>
                  Show all logs
                </Button>
              ) : null}
              {hasMore ? (
                <Button variant="outline" size="xs" onClick={onLoadEarlier}>
                  Load earlier events
                </Button>
              ) : null}
            </div>
            <ScrollArea className="h-80 border bg-muted/20">
              <div
                role="log"
                aria-label="Workflow run raw logs"
                className="grid gap-px p-3 font-mono text-[10px] leading-relaxed"
              >
                {!serviceFilter &&
                  keyLogLines(plainLogs).map(({ key, line }) => (
                    <div
                      key={key}
                      className="grid grid-cols-[38px_minmax(0,1fr)] gap-2"
                    >
                      <span className="text-muted-foreground">LOG</span>
                      <span className="whitespace-pre-wrap">{line}</span>
                    </div>
                  ))}
                {filteredEvents.map((event) => (
                  <div
                    key={`${event.timestamp}:${event.sequence}:raw`}
                    className="grid grid-cols-[70px_72px_minmax(0,1fr)] gap-2 border-t border-border/40 py-1"
                  >
                    <time className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </time>
                    <span className="truncate uppercase text-muted-foreground">
                      {event.stage || "runner"}
                    </span>
                    <span className="whitespace-pre-wrap">
                      {expert && event.serviceName
                        ? `[${event.serviceName}] `
                        : ""}
                      {event.message}
                    </span>
                  </div>
                ))}
                {containerLogs.map(([service, logs]) => (
                  <div
                    key={`${service}:${logs}`}
                    className="mt-2 border border-border p-2"
                  >
                    <p className="mb-1 font-semibold">container · {service}</p>
                    <pre className="whitespace-pre-wrap">{logs}</pre>
                  </div>
                ))}
                {filteredEvents.length === 0 &&
                (serviceFilter || plainLogs.length === 0) &&
                containerLogs.length === 0 ? (
                  <p className="text-muted-foreground">
                    No logs match this filter yet.
                  </p>
                ) : null}
              </div>
            </ScrollArea>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function WorkflowRunSkeleton() {
  return (
    <main
      className="mx-auto grid max-w-[1920px] gap-4 p-6"
      aria-label="Loading workflow run"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="grid gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-80" />
        </div>
        <Skeleton className="h-8 w-64" />
      </div>
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] 2xl:grid-cols-[minmax(0,1fr)_460px]">
        <Skeleton className="h-[560px] w-full" />
        <Skeleton className="h-[560px] w-full" />
      </div>
    </main>
  );
}
