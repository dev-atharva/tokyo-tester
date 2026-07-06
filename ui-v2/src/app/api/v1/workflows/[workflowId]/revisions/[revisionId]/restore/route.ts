import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { userHasProjectPermission } from "@/modules/projects/server/service";
import { proxyRunnerRequest } from "@/modules/workflow/server/runner-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ workflowId: string; revisionId: string }>;
};

export async function POST(request: NextRequest, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  let input: { projectId?: string; expectedVersion?: number };
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }
  const projectId = input.projectId ?? "";
  if (
    !projectId ||
    !(await userHasProjectPermission(
      session.user.id,
      projectId,
      "edit",
      session.user.role,
    ))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const { workflowId, revisionId } = await context.params;
  return proxyRunnerRequest(
    request,
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    JSON.stringify({
      projectId,
      expectedVersion: input.expectedVersion,
      userId: session.user.id,
    }),
  );
}
