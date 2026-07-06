import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { userHasProjectPermission } from "@/modules/projects/server/service";
import { proxyRunnerRequest } from "@/modules/workflow/server/runner-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ workflowId: string }> };

async function authorize(request: NextRequest, action: "view" | "edit") {
  const session = await auth();
  if (!session?.user?.id)
    return { error: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const projectId = request.nextUrl.searchParams.get("projectId") ?? "";
  if (
    !projectId ||
    !(await userHasProjectPermission(
      session.user.id,
      projectId,
      action,
      session.user.role,
    ))
  ) {
    return { error: Response.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session, projectId };
}

export async function GET(request: NextRequest, context: RouteContext) {
  const identity = await authorize(request, "view");
  if (identity.error) return identity.error;
  const { workflowId } = await context.params;
  return proxyRunnerRequest(
    request,
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions`,
  );
}

export async function POST(request: NextRequest, context: RouteContext) {
  const identity = await authorize(request, "edit");
  if (identity.error) return identity.error;
  const { workflowId } = await context.params;
  let input: { message?: string } = {};
  try {
    input = await request.json();
  } catch {
    /* message is optional */
  }
  return proxyRunnerRequest(
    request,
    `/api/v1/workflows/${encodeURIComponent(workflowId)}/revisions`,
    JSON.stringify({
      projectId: identity.projectId,
      userId: identity.session?.user?.id,
      message: input.message,
    }),
  );
}
