import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { userHasProjectPermission } from "@/modules/projects/server/service";
import { bindWorkflowRequestToIdentity } from "@/modules/workflow/server/authorized-request";
import { proxyRunnerRequest } from "@/modules/workflow/server/runner-proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    request?: Record<string, unknown>;
    runSecrets?: Array<{ secretRef?: unknown; value?: unknown }>;
  } | null;
  if (!body?.request || !Array.isArray(body.runSecrets)) {
    return Response.json(
      { error: "Invalid workflow run authorization" },
      { status: 400 },
    );
  }
  if (
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
  const projectId =
    typeof body.request.projectId === "string" ? body.request.projectId : "";
  if (
    !projectId ||
    !(await userHasProjectPermission(
      session.user.id,
      projectId,
      "run",
      session.user.role,
    ))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const boundRequest = bindWorkflowRequestToIdentity(
    body.request,
    session.user.id,
    projectId,
  );
  return proxyRunnerRequest(
    request,
    "/api/v1/workflow-runs/authorize",
    JSON.stringify({ request: boundRequest, runSecrets: body.runSecrets }),
  );
}
