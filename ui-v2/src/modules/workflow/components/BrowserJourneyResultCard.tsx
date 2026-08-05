"use client";

import {
  IconAlertTriangle,
  IconCamera,
  IconCheck,
  IconCircleX,
  IconDownload,
  IconExternalLink,
  IconFileZip,
  IconMapPin,
  IconMinus,
  IconPlayerPause,
  IconRoute,
  IconShieldLock,
} from "@tabler/icons-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  type BrowserJourneyParseResult,
  type BrowserJourneyResult,
  describeEvidenceSlot,
  type JourneyEvidenceSlot,
  type JourneyStepOutcome,
  journeyOutcomeCounts,
} from "../lib/browser-journey-results";
import { browserJourneyArtifactUrl } from "../lib/runner-client";
import type { ScenarioRunStatus } from "../types/react-flow-cots";

const outcomeIcons = {
  passed: IconCheck,
  failed: IconCircleX,
  skipped: IconMinus,
  interrupted: IconPlayerPause,
};

const outcomeLabels: Record<JourneyStepOutcome, string> = {
  passed: "Passed",
  failed: "Failed",
  skipped: "Skipped",
  interrupted: "Interrupted",
};

function numberField(value: unknown, key: string): number {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Number((value as Record<string, unknown>)[key] || 0)
    : 0;
}

export function WorkflowJourneySummary({ value }: { value: unknown }) {
  const totalJourneys = numberField(value, "totalJourneys");
  if (totalJourneys === 0) return null;
  const journeyCounters = [
    ["Total", totalJourneys],
    ["Passed", numberField(value, "passedJourneys")],
    ["Failed", numberField(value, "failedJourneys")],
    ["Interrupted", numberField(value, "interruptedJourneys")],
  ] as const;
  const stepCounters = [
    ["Total", numberField(value, "totalSteps")],
    ["Passed", numberField(value, "passedSteps")],
    ["Failed", numberField(value, "failedSteps")],
    ["Skipped", numberField(value, "skippedSteps")],
    ["Interrupted", numberField(value, "interruptedSteps")],
  ] as const;
  return (
    <Card data-testid="browser-journey-summary">
      <CardHeader className="border-b">
        <CardTitle>Browser result summary</CardTitle>
        <CardDescription>
          Journey and nested step counts are separate from legacy test counters.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <SummaryGroup title="Journeys" counters={journeyCounters} />
        <SummaryGroup title="Steps" counters={stepCounters} />
      </CardContent>
    </Card>
  );
}

function SummaryGroup({
  title,
  counters,
}: {
  title: string;
  counters: ReadonlyArray<readonly [string, number]>;
}) {
  return (
    <section className="border">
      <h3 className="border-b bg-muted/20 px-3 py-2 text-xs font-medium">
        {title}
      </h3>
      <dl
        className={cn(
          "grid grid-cols-2",
          counters.length === 5 ? "sm:grid-cols-5" : "sm:grid-cols-4",
        )}
      >
        {counters.map(([label, value]) => (
          <div key={label} className="border-r p-3 last:border-r-0">
            <dt className="text-[9px] uppercase tracking-wider text-muted-foreground">
              {label}
            </dt>
            <dd className="mt-1 font-mono text-base font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function durationLabel(milliseconds?: number) {
  if (milliseconds === undefined) return "—";
  if (milliseconds < 1000) return `${milliseconds} ms`;
  return `${(milliseconds / 1000).toFixed(milliseconds % 1000 === 0 ? 0 : 1)} s`;
}

function skipLabel(reason?: string) {
  if (reason === "prior-step-failed") return "A previous step failed";
  if (reason === "journey-interrupted") return "The journey was interrupted";
  if (reason === "journey-not-started") return "The journey did not start";
  return "Not executed";
}

export function BrowserJourneyResultCard({
  parsed,
  scenarioName,
  scenarioStatus,
  workflowRunId,
  projectId,
}: {
  parsed: BrowserJourneyParseResult;
  scenarioName: string;
  scenarioStatus?: ScenarioRunStatus;
  workflowRunId: string;
  projectId: string;
}) {
  if (parsed.unsupportedVersion !== undefined) {
    return (
      <Alert variant="destructive" data-testid="unsupported-journey-result">
        <IconAlertTriangle />
        <AlertTitle>Unsupported browser-journey result</AlertTitle>
        <AlertDescription>
          Result schema {parsed.unsupportedVersion} cannot be rendered safely by
          this version of Tokyo Tester.
        </AlertDescription>
      </Alert>
    );
  }
  const result = parsed.result;
  if (!result) {
    return (
      <Card data-testid="browser-journey-result">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconRoute /> Browser journey
          </CardTitle>
          <CardDescription>
            The durable aggregate has not been recorded yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const counts = journeyOutcomeCounts(result);
  return (
    <Card data-testid="browser-journey-result" data-outcome={result.outcome}>
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <IconRoute /> {scenarioName}
        </CardTitle>
        <CardDescription>
          One authoritative journey result with every defined step in order.
        </CardDescription>
        <CardAction>
          <JourneyOutcomeBadge outcome={result.outcome} />
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-5">
        {scenarioStatus === "cancelled" ? (
          <Alert>
            <IconPlayerPause />
            <AlertTitle>Scenario cancelled</AlertTitle>
            <AlertDescription>
              Cancellation is the scenario lifecycle state. The interrupted step
              below preserves what was known about browser behavior.
            </AlertDescription>
          </Alert>
        ) : null}
        {scenarioStatus === "cleanup_failed" ? (
          <Alert variant="destructive">
            <IconAlertTriangle />
            <AlertTitle>Cleanup failed after browser execution</AlertTitle>
            <AlertDescription>
              The journey outcome remains authoritative; cleanup is reported as
              a separate scenario failure.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="grid grid-cols-2 border md:grid-cols-5">
          <ResultMetric label="Journey" value={result.outcome} />
          <ResultMetric label="Passed steps" value={String(counts.passed)} />
          <ResultMetric label="Failed steps" value={String(counts.failed)} />
          <ResultMetric
            label="Skipped / interrupted"
            value={String(counts.skipped + counts.interrupted)}
          />
          <ResultMetric
            label="Duration"
            value={durationLabel(result.durationMs)}
          />
        </div>

        {result.finalLocation ? (
          <div className="flex flex-wrap items-start gap-3 border bg-muted/20 p-3">
            <IconMapPin
              className="mt-0.5 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium">Sanitized final location</p>
              <code className="mt-1 block break-all text-xs">
                {result.finalLocation.path}
              </code>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Query keys:{" "}
                {result.finalLocation.queryKeys?.join(", ") || "none"}. Values
                and fragments were not retained.
              </p>
            </div>
          </div>
        ) : null}

        <section aria-labelledby="journey-step-timeline-title">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h3
                id="journey-step-timeline-title"
                className="text-sm font-medium"
              >
                Step timeline
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Actions, assertions, and the fail-fast suffix are kept separate
                from legacy test results.
              </p>
            </div>
            <Badge variant="outline">{result.steps.length} steps</Badge>
          </div>
          <ol className="grid gap-2">
            {result.steps
              .slice()
              .sort((left, right) => left.sequence - right.sequence)
              .map((step, index) => {
                const Icon = outcomeIcons[step.outcome];
                const diagnostic = result.diagnostics?.find(
                  (item) =>
                    item.diagnosticId === step.diagnosticId ||
                    item.stepId === step.stepId,
                );
                return (
                  <li
                    key={step.stepId}
                    data-testid="journey-step-result"
                    data-status={step.outcome}
                    className={cn(
                      "relative grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border p-3",
                      step.outcome === "failed" && "border-destructive/60",
                    )}
                  >
                    {index < result.steps.length - 1 ? (
                      <span
                        className="absolute bottom-[-9px] left-[27px] top-11 z-10 w-px bg-border"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative z-20 grid size-8 place-items-center border bg-background",
                        step.outcome === "passed" &&
                          "border-primary text-primary",
                        step.outcome === "failed" &&
                          "border-destructive bg-destructive text-destructive-foreground",
                        (step.outcome === "skipped" ||
                          step.outcome === "interrupted") &&
                          "text-muted-foreground",
                      )}
                    >
                      <Icon aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {String(step.sequence + 1).padStart(2, "0")} ·{" "}
                        {step.kind} · {step.operation}
                      </p>
                      <p className="mt-1 text-xs font-medium">{step.name}</p>
                      {step.outcome === "skipped" ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {skipLabel(step.skipReason)}
                        </p>
                      ) : null}
                      {diagnostic ? (
                        <div className="mt-2 border-l-2 border-destructive pl-2">
                          <p className="text-xs font-medium">
                            {diagnostic.summary}
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                            {diagnostic.code} ·{" "}
                            {diagnostic.source.replaceAll("_", " ")}
                          </p>
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          step.outcome === "failed" ? "destructive" : "outline"
                        }
                      >
                        {outcomeLabels[step.outcome]}
                      </Badge>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {durationLabel(step.durationMs)}
                      </p>
                    </div>
                  </li>
                );
              })}
          </ol>
        </section>

        <section aria-labelledby="journey-evidence-title">
          <div className="mb-3">
            <h3 id="journey-evidence-title" className="text-sm font-medium">
              Failure evidence
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Controls appear only for artifacts available to this authorized
              run response.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <EvidenceCard
              kind="screenshot"
              slot={result.evidence.screenshot}
              workflowRunId={workflowRunId}
              projectId={projectId}
            />
            <EvidenceCard
              kind="trace"
              slot={result.evidence.trace}
              workflowRunId={workflowRunId}
              projectId={projectId}
            />
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function JourneyOutcomeBadge({
  outcome,
}: Pick<BrowserJourneyResult, "outcome">) {
  if (outcome === "failed") {
    return (
      <Badge variant="destructive">
        <IconCircleX /> Behavior failed
      </Badge>
    );
  }
  if (outcome === "interrupted") {
    return (
      <Badge variant="secondary">
        <IconPlayerPause /> Interrupted
      </Badge>
    );
  }
  return (
    <Badge variant="outline">
      <IconCheck /> Passed
    </Badge>
  );
}

function ResultMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r p-3 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium capitalize">{value}</p>
    </div>
  );
}

function EvidenceCard({
  kind,
  slot,
  workflowRunId,
  projectId,
}: {
  kind: "screenshot" | "trace";
  slot: JourneyEvidenceSlot;
  workflowRunId: string;
  projectId: string;
}) {
  const Icon = kind === "screenshot" ? IconCamera : IconFileZip;
  const artifact = slot.artifact;
  const available = slot.status === "available" && Boolean(artifact);
  const url =
    available && artifact
      ? browserJourneyArtifactUrl(workflowRunId, artifact.artifactId, projectId)
      : null;
  return (
    <article className="grid grid-cols-[36px_minmax(0,1fr)] gap-3 border p-3">
      <span className="grid size-9 place-items-center border bg-muted/30">
        {slot.status === "suppressed" ? (
          <IconShieldLock aria-hidden="true" />
        ) : (
          <Icon aria-hidden="true" />
        )}
      </span>
      <div className="min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium capitalize">{kind}</p>
          <Badge variant="outline">{slot.status}</Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {describeEvidenceSlot(slot)}
        </p>
        {available && url && artifact ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={url}
              target={kind === "screenshot" ? "_blank" : undefined}
              rel={kind === "screenshot" ? "noreferrer" : undefined}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {kind === "screenshot" ? (
                <IconExternalLink data-icon="inline-start" />
              ) : (
                <IconDownload data-icon="inline-start" />
              )}
              {kind === "screenshot" ? "View screenshot" : "Download trace"}
            </a>
            <span className="text-[10px] text-muted-foreground">
              {Math.ceil(artifact.sizeBytes / 1024)} KiB · expires{" "}
              {new Date(artifact.expiresAt).toLocaleDateString()}
            </span>
          </div>
        ) : null}
      </div>
    </article>
  );
}
