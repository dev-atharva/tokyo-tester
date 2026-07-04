import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { userHasProjectAccess } from "@/modules/projects/server/service";
import { proxyRunnerRequest } from "@/modules/workflow/server/runner-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowRunId: string }> },
) {
  const { workflowRunId } = await context.params;
  const session = await auth();
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    !projectId ||
    !(await userHasProjectAccess(session.user.id, projectId, session.user.role))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return proxyRunnerRequest(
    request,
    `/api/v1/workflow-runs/${encodeURIComponent(workflowRunId)}`,
  );
}
