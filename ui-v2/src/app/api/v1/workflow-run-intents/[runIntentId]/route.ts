import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  cancelAwaitingRunIntent,
  getRunIntentForHuman,
  publicRunIntent,
} from "@/modules/agent/server/run-intents";
import { userHasProjectPermission } from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function authorizedIntent(
  userId: string,
  platformRole: string | undefined,
  runIntentId: string,
) {
  const intent = await getRunIntentForHuman(userId, runIntentId);
  if (
    !intent ||
    !(await userHasProjectPermission(
      userId,
      intent.projectId,
      "run",
      platformRole,
    ))
  ) {
    return null;
  }
  return intent;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runIntentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runIntentId } = await context.params;
  const intent = await authorizedIntent(
    session.user.id,
    session.user.role,
    runIntentId,
  );
  if (!intent) {
    return Response.json({ error: "Run intent not found." }, { status: 404 });
  }
  return Response.json(publicRunIntent(intent));
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ runIntentId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runIntentId } = await context.params;
  const intent = await authorizedIntent(
    session.user.id,
    session.user.role,
    runIntentId,
  );
  if (!intent) {
    return Response.json({ error: "Run intent not found." }, { status: 404 });
  }
  await cancelAwaitingRunIntent(session.user.id, intent.id);
  const cancelled = await getRunIntentForHuman(session.user.id, intent.id);
  return Response.json(cancelled ? publicRunIntent(cancelled) : null);
}
