import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { authenticatePersonalAgentToken } from "@/modules/agent/server/auth";
import { getMcpAuthMode } from "@/modules/agent/server/mcp-config";
import { getUserById } from "@/modules/auth/server/repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validInternalSecret(request: NextRequest) {
  const expected = Buffer.from(process.env.MCP_INTERNAL_SECRET ?? "");
  const received = Buffer.from(request.headers.get("x-tokyo-mcp-secret") ?? "");
  return (
    expected.length >= 32 &&
    received.length === expected.length &&
    timingSafeEqual(received, expected)
  );
}

export async function POST(request: NextRequest) {
  if (getMcpAuthMode() !== "personal_token") {
    return Response.json({ active: false }, { status: 404 });
  }
  if (!validInternalSecret(request)) {
    return Response.json({ active: false }, { status: 401 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const identity = await authenticatePersonalAgentToken(token);
  if (!identity) return Response.json({ active: false });
  const user = await getUserById(identity.userId);
  if (!user?.email) return Response.json({ active: false });
  return Response.json({
    active: true,
    sub: identity.userId,
    user_id: identity.userId,
    email: user.email,
    project_id: identity.projectId,
    scopes: identity.scopes,
  });
}
