import type { NextRequest } from "next/server";
import { requiredIdempotencyKey, withAgent } from "@/modules/agent/server/http";
import { runExistingWorkflow } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return withAgent(request, "run", async (identity) => {
    const key = requiredIdempotencyKey(request);
    if (!key)
      return Response.json(
        { error: "Idempotency-Key must contain 8-200 characters." },
        { status: 400 },
      );
    const { workflowId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      scenarioIds?: string[];
    };
    if (
      body.scenarioIds !== undefined &&
      (!Array.isArray(body.scenarioIds) ||
        body.scenarioIds.some((id) => typeof id !== "string"))
    ) {
      return Response.json(
        { error: "scenarioIds must be an array of strings." },
        { status: 400 },
      );
    }
    try {
      const run = await runExistingWorkflow(
        identity,
        workflowId,
        key,
        body.scenarioIds,
      );
      const value = await run.response
        .json()
        .catch(() => ({ error: "Runner returned an invalid response." }));
      return Response.json(
        {
          ...(value as object),
          workflowRunId: run.workflowRunId,
          scenarioIds: run.scenarioIds,
        },
        { status: run.response.status },
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid workflow run request.",
        },
        { status: 400 },
      );
    }
  });
}
