"use client";

import {
  IconAlertTriangle,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconKey,
  IconLoader2,
  IconPlayerPlay,
  IconRobot,
  IconShieldCheck,
  IconX,
} from "@tabler/icons-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useProjectContext } from "@/modules/projects/project-context";
import { useRunSecretStore } from "../stores/run-secret-store";

type RunIntentStatus =
  | "awaiting-human"
  | "submitting"
  | "submitted"
  | "cancelled"
  | "expired";

interface PublicRunIntent {
  kind: "human_input_required";
  runIntentId: string;
  status: RunIntentStatus;
  handoffUrl: string;
  requiredSecretRefs: string[];
  createdAt: string;
  expiresAt: string;
  workflowRunId?: string;
  selection: {
    projectId: string;
    operation: "bundle" | "existing";
    workflowId: string;
    workflowName: string;
    scenarioIds: string[];
    scenarioNames: string[];
  };
}

const EMPTY_VALUES: Record<string, string> = {};

export function RunIntentHandoffPage({ runIntentId }: { runIntentId: string }) {
  const { userId } = useProjectContext();
  const [intent, setIntent] = useState<PublicRunIntent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [replacing, setReplacing] = useState<Set<string>>(new Set());
  const scope = useMemo(
    () => ({
      userId: userId ?? "",
      projectId: intent?.selection.projectId ?? "",
      workflowId: intent?.selection.workflowId ?? "",
    }),
    [intent?.selection.projectId, intent?.selection.workflowId, userId],
  );
  const storedValues = useRunSecretStore(
    (state) =>
      state.values[scope.userId]?.[scope.projectId]?.[scope.workflowId],
  );
  const sessionValues = storedValues ?? EMPTY_VALUES;
  const setSessionSecret = useRunSecretStore((state) => state.setSecret);
  const clearSessionSecret = useRunSecretStore((state) => state.clearSecret);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/workflow-run-intents/${encodeURIComponent(runIntentId)}`,
        { cache: "no-store" },
      );
      const value = (await response.json().catch(() => ({}))) as
        | PublicRunIntent
        | { error?: string };
      if (!response.ok || !("kind" in value)) {
        throw new Error(
          "error" in value && value.error
            ? value.error
            : "Unable to load this run request.",
        );
      }
      setIntent(value);
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Unable to load this run request.",
      );
    } finally {
      setLoading(false);
    }
  }, [runIntentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unresolved = (intent?.requiredSecretRefs || []).filter(
    (secretRef) =>
      (replacing.has(secretRef) || sessionValues[secretRef] === undefined) &&
      !drafts[secretRef],
  );

  const authorize = async () => {
    if (!intent || intent.status !== "awaiting-human") return;
    setSubmitting(true);
    setError(null);
    const runSecrets = intent.requiredSecretRefs.map((secretRef) => {
      const draft = drafts[secretRef];
      const value =
        replacing.has(secretRef) || sessionValues[secretRef] === undefined
          ? draft
          : sessionValues[secretRef];
      if (draft) setSessionSecret(scope, secretRef, draft);
      return { secretRef, value: value ?? "" };
    });
    try {
      const response = await fetch(
        `/api/v1/workflow-run-intents/${encodeURIComponent(runIntentId)}/authorize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ runSecrets }),
        },
      );
      const value = (await response.json().catch(() => ({}))) as
        | (PublicRunIntent & { run?: { workflowRunId?: string } })
        | { error?: string };
      if (!response.ok || !("kind" in value)) {
        throw new Error(
          "error" in value && value.error
            ? value.error
            : "Unable to authorize this run.",
        );
      }
      setIntent({
        ...value,
        workflowRunId: value.workflowRunId || value.run?.workflowRunId,
      });
      setDrafts({});
      setReplacing(new Set());
      toast.success("Workflow run authorized and submitted");
    } catch (nextError) {
      const message =
        nextError instanceof Error
          ? nextError.message
          : "Unable to authorize this run.";
      setError(message);
      toast.error(message);
      await load();
    } finally {
      for (const item of runSecrets) item.value = "";
      setSubmitting(false);
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try {
      const response = await fetch(
        `/api/v1/workflow-run-intents/${encodeURIComponent(runIntentId)}`,
        { method: "DELETE" },
      );
      if (!response.ok) throw new Error("Unable to cancel this run request.");
      setIntent((await response.json()) as PublicRunIntent);
      setDrafts({});
    } catch (nextError) {
      toast.error(
        nextError instanceof Error
          ? nextError.message
          : "Unable to cancel this run request.",
      );
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-4xl place-items-center p-6">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <IconLoader2 className="animate-spin" /> Loading run request…
        </div>
      </main>
    );
  }
  if (error && !intent) {
    return (
      <main className="mx-auto grid min-h-[70vh] max-w-3xl place-items-center p-6">
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Unable to open run request</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <div className="col-start-2 mt-3">
            <Button size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </Alert>
      </main>
    );
  }
  if (!intent) return null;

  const terminal = intent.status !== "awaiting-human";
  return (
    <main
      data-testid="run-intent-handoff"
      className="mx-auto grid w-full max-w-5xl gap-5 p-4 lg:p-8"
    >
      <div className="border-b pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Agent handoff
          </p>
          <IntentStatusBadge status={intent.status} />
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Authorize browser journey
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          An agent prepared the selection. Review its public details and enter
          the run-only values that automation is not allowed to access.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <IconAlertTriangle />
          <AlertTitle>Authorization was not completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <IconKey /> Run secrets
            </CardTitle>
            <CardDescription>
              Values remain in memory for this open Tokyo Tester session and are
              submitted only through this one-time authorization.
            </CardDescription>
            <CardAction>
              <Badge variant="outline">
                {intent.requiredSecretRefs.length} required
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            {terminal ? (
              <TerminalIntentState
                intent={intent}
                projectId={intent.selection.projectId}
              />
            ) : intent.requiredSecretRefs.length === 0 ? (
              <Alert>
                <IconShieldCheck />
                <AlertTitle>No run secrets are required</AlertTitle>
                <AlertDescription>
                  Review the prepared selection, then authorize the run.
                </AlertDescription>
              </Alert>
            ) : (
              <FieldSet>
                <FieldLegend>Required references</FieldLegend>
                <FieldDescription>
                  Reference names came from the durable journey definition.
                  Secret values are never returned by this page or its API.
                </FieldDescription>
                <FieldGroup className="mt-3">
                  {intent.requiredSecretRefs.map((secretRef) => {
                    const available =
                      sessionValues[secretRef] !== undefined &&
                      !replacing.has(secretRef);
                    const invalid = unresolved.includes(secretRef);
                    return (
                      <Field
                        key={secretRef}
                        className="border p-3"
                        data-invalid={invalid}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <FieldLabel htmlFor={`intent-secret-${secretRef}`}>
                            <code>{secretRef}</code>
                          </FieldLabel>
                          {available ? (
                            <Badge variant="outline">
                              Available this session
                            </Badge>
                          ) : null}
                        </div>
                        {available ? (
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setReplacing((current) =>
                                  new Set(current).add(secretRef),
                                )
                              }
                            >
                              Replace
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                clearSessionSecret(scope, secretRef)
                              }
                            >
                              Clear
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Input
                              id={`intent-secret-${secretRef}`}
                              type="password"
                              autoComplete="new-password"
                              spellCheck={false}
                              value={drafts[secretRef] ?? ""}
                              aria-invalid={invalid}
                              placeholder="Enter for this session"
                              onChange={(event) =>
                                setDrafts((current) => ({
                                  ...current,
                                  [secretRef]: event.target.value,
                                }))
                              }
                            />
                            <FieldError>
                              {invalid
                                ? "Enter a value before authorizing."
                                : null}
                            </FieldError>
                            {sessionValues[secretRef] !== undefined ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="w-fit"
                                onClick={() => {
                                  setReplacing((current) => {
                                    const next = new Set(current);
                                    next.delete(secretRef);
                                    return next;
                                  });
                                  setDrafts((current) => {
                                    const next = { ...current };
                                    delete next[secretRef];
                                    return next;
                                  });
                                }}
                              >
                                Keep available value
                              </Button>
                            ) : null}
                          </>
                        )}
                      </Field>
                    );
                  })}
                </FieldGroup>
              </FieldSet>
            )}
          </CardContent>
          {!terminal ? (
            <CardFooter className="justify-between gap-3">
              <Button
                variant="ghost"
                disabled={submitting || cancelling}
                onClick={() => void cancel()}
              >
                <IconX data-icon="inline-start" />
                {cancelling ? "Cancelling…" : "Cancel request"}
              </Button>
              <Button
                data-testid="authorize-run-intent"
                disabled={submitting || cancelling || unresolved.length > 0}
                onClick={() => void authorize()}
              >
                {submitting ? (
                  <IconLoader2
                    data-icon="inline-start"
                    className="animate-spin"
                  />
                ) : (
                  <IconPlayerPlay data-icon="inline-start" />
                )}
                {submitting ? "Authorizing…" : "Authorize and run"}
              </Button>
            </CardFooter>
          ) : null}
        </Card>

        <aside className="grid gap-4">
          <Card size="sm">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <IconRobot /> Prepared selection
              </CardTitle>
              <CardDescription>
                Public, non-secret context supplied by the agent.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Workflow
                </p>
                <p className="mt-1 text-sm font-medium">
                  {intent.selection.workflowName}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Scenarios
                </p>
                <ul className="mt-2 grid gap-1.5">
                  {intent.selection.scenarioNames.map((name) => (
                    <li key={name} className="border px-2 py-1.5 text-xs">
                      {name}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-start gap-2 border-t pt-3 text-xs text-muted-foreground">
                <IconClock className="mt-0.5" aria-hidden="true" />
                <span>
                  Expires {new Date(intent.expiresAt).toLocaleString()}. This
                  authorization can be used only once.
                </span>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}

function IntentStatusBadge({ status }: { status: RunIntentStatus }) {
  return (
    <Badge
      variant={
        status === "submitted"
          ? "outline"
          : status === "awaiting-human"
            ? "secondary"
            : "destructive"
      }
      className="capitalize"
    >
      {status === "submitted" ? <IconCheck /> : <IconClock />}
      {status.replaceAll("-", " ")}
    </Badge>
  );
}

function TerminalIntentState({
  intent,
  projectId,
}: {
  intent: PublicRunIntent;
  projectId: string | null;
}) {
  if (intent.status === "submitted") {
    const href = intent.workflowRunId
      ? `/workflow/${encodeURIComponent(intent.selection.workflowId)}/runs/${encodeURIComponent(intent.workflowRunId)}${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`
      : `/workflow/${encodeURIComponent(intent.selection.workflowId)}`;
    return (
      <Alert>
        <IconCheck />
        <AlertTitle>Run submitted</AlertTitle>
        <AlertDescription>
          The one-time authorization was consumed. No secret values are retained
          in the run intent.
        </AlertDescription>
        <div className="col-start-2 mt-3">
          <Link
            href={href}
            className={cn(buttonVariants({ size: "sm" }), "w-fit")}
          >
            Open workflow run <IconArrowRight data-icon="inline-end" />
          </Link>
        </div>
      </Alert>
    );
  }
  return (
    <Alert variant="destructive">
      <IconAlertTriangle />
      <AlertTitle>
        {intent.status === "expired"
          ? "Run request expired"
          : "Run request cancelled"}
      </AlertTitle>
      <AlertDescription>
        Ask the agent to prepare a new run request. Secret values were not
        submitted.
      </AlertDescription>
    </Alert>
  );
}
