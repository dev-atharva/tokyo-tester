import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  AGENT_SCOPES,
  type AgentScope,
  createAgentToken,
} from "@/modules/agent/server/auth";
import { userHasProjectAccess } from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as {
    name?: string;
    projectId?: string;
    scopes?: string[];
    expiresInDays?: number;
  };
  const projectId = body.projectId?.trim() ?? "";
  if (
    !projectId ||
    !(await userHasProjectAccess(session.user.id, projectId, session.user.role))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const scopes = (body.scopes ?? ["read", "workflow:write", "run"]).filter(
    (scope): scope is AgentScope => AGENT_SCOPES.includes(scope as AgentScope),
  );
  if (scopes.length === 0)
    return Response.json(
      { error: "At least one valid scope is required." },
      { status: 400 },
    );
  const days = Math.min(Math.max(body.expiresInDays ?? 30, 1), 90);
  const created = await createAgentToken({
    name: body.name?.trim() || "Tokyo Tester agent",
    userId: session.user.id,
    projectId,
    scopes,
    expiresAt: new Date(Date.now() + days * 86_400_000),
  });
  return Response.json({ ...created, projectId, scopes }, { status: 201 });
}
