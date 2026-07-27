import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  getMcpAuthMode,
  projectMcpResource,
} from "@/modules/agent/server/mcp-config";
import { getProjectMembership } from "@/modules/projects/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
  if (!projectId || projectId.length > 255) {
    return Response.json({ error: "Invalid project" }, { status: 400 });
  }
  const membership = projectId
    ? await getProjectMembership(session.user.id, projectId, session.user.role)
    : null;
  if (!membership) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const mcpUrl = projectMcpResource(projectId);
  if (!mcpUrl) {
    return Response.json(
      { error: "MCP_PUBLIC_URL is not configured" },
      { status: 503 },
    );
  }
  return Response.json({
    authMode: getMcpAuthMode(),
    mcpUrl,
    project: { id: membership.id, name: membership.name },
    skillDownloadUrl: "/downloads/tokyo-tester-skill.tar.gz",
  });
}
