import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { userHasProjectAccess } from "@/modules/projects/server/service";
import { bindWorkflowRequestToIdentity } from "@/modules/workflow/server/authorized-request";
import { proxyRunnerRequest } from "@/modules/workflow/server/runner-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return Response.json(
      { error: "Invalid workflow request" },
      { status: 400 },
    );
  }
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (
    !projectId ||
    !(await userHasProjectAccess(session.user.id, projectId, session.user.role))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  body = bindWorkflowRequestToIdentity(body, session.user.id, projectId);
  return proxyRunnerRequest(
    request,
    "/api/v1/workflow-runs",
    JSON.stringify(body),
  );
}
