import type { FlowEdge, Scenario } from "../types/react-flow-cots";

export type AuthoringMode = "guided" | "expert";
export type GuidedStage = "services" | "connections" | "scenarios" | "review";
export type ChecklistStatus =
  | "complete"
  | "optional"
  | "review"
  | "pending"
  | "ready";

export interface GuidedChecklistItem {
  stage: GuidedStage;
  title: string;
  description: string;
  status: ChecklistStatus;
}

export interface BuilderExperience {
  mode: AuthoringMode;
  checklistDismissed: boolean;
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const BUILDER_MODE_KEY_PREFIX = "tokyo-tester:builder-mode";
const CHECKLIST_KEY_PREFIX = "tokyo-tester:guided-checklist-dismissed";

export const GUIDED_DOCUMENTATION = {
  mode: {
    label: "Choosing a builder mode",
    href: "/docs/guides/build-service-graph#choose-a-builder-mode",
  },
  gettingStarted: {
    label: "Build your first workflow",
    href: "/docs/start/first-workflow",
  },
  services: {
    label: "Configure services",
    href: "/docs/guides/configure-services",
  },
  connections: {
    label: "Connect services",
    href: "/docs/guides/build-service-graph#connect-services",
  },
  scenarios: {
    label: "Write scenarios",
    href: "/docs/guides/write-scenarios",
  },
  review: {
    label: "Run and debug",
    href: "/docs/guides/run-and-debug",
  },
  lifecycle: {
    label: "Execution lifecycle",
    href: "/docs/concepts/execution-lifecycle",
  },
} as const;

export function builderModeStorageKey(userId: string) {
  return `${BUILDER_MODE_KEY_PREFIX}:${userId}`;
}

export function checklistStorageKey(userId: string) {
  return `${CHECKLIST_KEY_PREFIX}:${userId}`;
}

export function readBuilderExperience(
  storage: PreferenceStorage | undefined,
  userId: string | null,
): BuilderExperience {
  if (!storage || !userId) {
    return { mode: "guided", checklistDismissed: false };
  }

  try {
    const storedMode = storage.getItem(builderModeStorageKey(userId));
    return {
      mode:
        storedMode === "guided" || storedMode === "expert"
          ? storedMode
          : "guided",
      checklistDismissed:
        storage.getItem(checklistStorageKey(userId)) === "true",
    };
  } catch {
    return { mode: "guided", checklistDismissed: false };
  }
}

export function persistBuilderMode(
  storage: PreferenceStorage | undefined,
  userId: string | null,
  mode: AuthoringMode,
) {
  if (!storage || !userId) return false;
  try {
    storage.setItem(builderModeStorageKey(userId), mode);
    return true;
  } catch {
    return false;
  }
}

export function persistChecklistDismissal(
  storage: PreferenceStorage | undefined,
  userId: string | null,
  dismissed: boolean,
) {
  if (!storage || !userId) return false;
  try {
    storage.setItem(checklistStorageKey(userId), String(dismissed));
    return true;
  } catch {
    return false;
  }
}

export function deriveGuidedChecklist({
  serviceCount,
  edges,
  scenarios,
  validationErrorCount,
}: {
  serviceCount: number;
  edges: FlowEdge[];
  scenarios: Scenario[];
  validationErrorCount: number;
}): GuidedChecklistItem[] {
  const hasServices = serviceCount > 0;
  const hasScenarioTests = scenarios.some(
    (scenario) => !scenario.is_deleted && scenario.tests.length > 0,
  );
  const reviewedConnections =
    edges.length > 0 && !edges.some((edge) => edge.data?.needsReview);
  const reviewReady =
    hasServices && hasScenarioTests && validationErrorCount === 0;

  const connectionState: Pick<GuidedChecklistItem, "description" | "status"> =
    serviceCount < 2
      ? {
          status: "optional",
          description: "Not needed until two or more services interact.",
        }
      : reviewedConnections
        ? {
            status: "complete",
            description: "Service relationships are confirmed.",
          }
        : {
            status: "review",
            description:
              edges.length === 0
                ? "Review whether these services need to communicate."
                : "Confirm the suggested relationship and startup order.",
          };

  return [
    {
      stage: "services",
      title: "Add the environment",
      description: hasServices
        ? `${serviceCount} service${serviceCount === 1 ? "" : "s"} configured.`
        : "Add the application and infrastructure this run needs.",
      status: hasServices ? "complete" : "pending",
    },
    {
      stage: "connections",
      title: "Review connections",
      ...connectionState,
    },
    {
      stage: "scenarios",
      title: "Describe what to prove",
      description: hasScenarioTests
        ? "At least one ordered test step is ready."
        : "Create a scenario and add an assertion or recipe.",
      status: hasScenarioTests ? "complete" : "pending",
    },
    {
      stage: "review",
      title: "Validate and run",
      description: reviewReady
        ? "Required configuration is ready for review."
        : validationErrorCount > 0
          ? `${validationErrorCount} validation issue${validationErrorCount === 1 ? "" : "s"} need attention.`
          : "Add a service and scenario before running.",
      status: reviewReady ? "ready" : "pending",
    },
  ];
}
