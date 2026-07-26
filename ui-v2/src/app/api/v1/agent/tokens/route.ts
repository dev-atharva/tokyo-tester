import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  AGENT_SCOPES,
  type AgentScope,
  availableAgentScopes,
  createAgentToken,
  listAgentTokens,
} from "@/modules/agent/server/auth";
import { getMcpAuthMode } from "@/modules/agent/server/mcp-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json({ tokens: await listAgentTokens(session.user.id) });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (getMcpAuthMode() !== "personal_token") {
    return Response.json(
      { error: "Personal tokens are disabled; connect with OAuth." },
      { status: 409 },
    );
  }
  let body: {
    name?: string;
    projectId?: string;
    scopes?: string[];
    expiresInDays?: number;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (
    (body.name !== undefined &&
      (typeof body.name !== "string" || body.name.trim().length > 100)) ||
    typeof body.projectId !== "string" ||
    body.projectId.trim().length > 255 ||
    (body.scopes !== undefined &&
      (!Array.isArray(body.scopes) ||
        body.scopes.some(
          (scope) =>
            typeof scope !== "string" ||
            !AGENT_SCOPES.includes(scope as AgentScope),
        ) ||
        new Set(body.scopes).size !== body.scopes.length)) ||
    (body.expiresInDays !== undefined &&
      (!Number.isFinite(body.expiresInDays) ||
        !Number.isInteger(body.expiresInDays)))
  ) {
    return Response.json({ error: "Invalid token request" }, { status: 400 });
  }
  const projectId = body.projectId?.trim() ?? "";
  const availableScopes = projectId
    ? await availableAgentScopes(session.user.id, projectId, session.user.role)
    : [];
  if (availableScopes.length === 0) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const requestedScopes = (body.scopes ?? availableScopes) as AgentScope[];
  const unavailable = requestedScopes.filter(
    (scope) => !availableScopes.includes(scope),
  );
  if (unavailable.length > 0) {
    return Response.json(
      {
        error: `Current project role does not allow: ${unavailable.join(", ")}`,
      },
      { status: 403 },
    );
  }
  const scopes = requestedScopes;
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
