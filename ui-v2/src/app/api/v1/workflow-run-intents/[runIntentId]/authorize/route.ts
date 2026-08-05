import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import type { AgentIdentity } from "@/modules/agent/server/auth";
import {
  cancelClaimedRunIntent,
  claimRunIntent,
  completeRunIntent,
  getRunIntentForHuman,
  publicRunIntent,
} from "@/modules/agent/server/run-intents";
import { runBundle, runExistingWorkflow } from "@/modules/agent/server/service";
import { userHasProjectPermission } from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ runIntentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runIntentId } = await context.params;
  const intent = await getRunIntentForHuman(session.user.id, runIntentId);
  if (!intent) {
    return Response.json({ error: "Run intent not found." }, { status: 404 });
  }
  const canRun = await userHasProjectPermission(
    session.user.id,
    intent.projectId,
    "run",
    session.user.role,
  );
  const canEdit =
    intent.operation !== "bundle" ||
    (await userHasProjectPermission(
      session.user.id,
      intent.projectId,
      "edit",
      session.user.role,
    ));
  if (!canRun || !canEdit) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    runSecrets?: Array<{ secretRef?: unknown; value?: unknown }>;
  } | null;
  if (
    !Array.isArray(body?.runSecrets) ||
    body.runSecrets.some(
      (item) =>
        !item ||
        typeof item.secretRef !== "string" ||
        typeof item.value !== "string",
    )
  ) {
    return Response.json(
      { error: "Run secrets must contain reference names and values." },
      { status: 400 },
    );
  }
  const runSecrets = body.runSecrets as Array<{
    secretRef: string;
    value: string;
  }>;
  const claimed = await claimRunIntent(session.user.id, intent.id);
  if (!claimed) {
    return Response.json(
      { error: "Run intent is no longer awaiting authorization." },
      { status: 409 },
    );
  }
  const identity: AgentIdentity = {
    tokenId: claimed.principalId,
    userId: claimed.userId,
    projectId: claimed.projectId,
    scopes: ["read", "workflow:write", "run"],
  };
  try {
    const run =
      claimed.payload.operation === "bundle"
        ? await runBundle(
            identity,
            claimed.payload.bundle,
            claimed.idempotencyKey,
            claimed.payload.scenarioNames,
            runSecrets,
          )
        : await runExistingWorkflow(
            identity,
            claimed.payload.workflowId,
            claimed.idempotencyKey,
            claimed.payload.scenarioIds,
            {
              runSecrets,
              expectedWorkflowVersion: claimed.payload.expectedWorkflowVersion,
              expectedScenarioVersions:
                claimed.payload.expectedScenarioVersions,
            },
          );
    const value = await run.response
      .json()
      .catch(() => ({ error: "Runner returned an invalid response." }));
    if (!run.response.ok) {
      await cancelClaimedRunIntent(claimed.id, claimed.claimId ?? "");
      return Response.json(value, { status: run.response.status });
    }
    await completeRunIntent(
      claimed.id,
      claimed.claimId ?? "",
      run.workflowRunId,
    );
    const submitted = await getRunIntentForHuman(session.user.id, claimed.id);
    return Response.json(
      submitted
        ? { ...publicRunIntent(submitted), run: value }
        : { ...value, workflowRunId: run.workflowRunId },
      { status: run.response.status },
    );
  } catch (error) {
    await cancelClaimedRunIntent(claimed.id, claimed.claimId ?? "");
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to authorize workflow run.",
      },
      { status: 400 },
    );
  } finally {
    for (const item of runSecrets) item.value = "";
  }
}
