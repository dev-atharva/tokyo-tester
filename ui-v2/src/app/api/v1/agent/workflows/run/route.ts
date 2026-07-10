import type { NextRequest } from "next/server";
import {
  copyJSONResponse,
  requiredIdempotencyKey,
  withAgent,
} from "@/modules/agent/server/http";
import { runBundle, validateBundle } from "@/modules/agent/server/service";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return withAgent(request, ["workflow:write", "run"], async (identity) => {
    const key = requiredIdempotencyKey(request);
    if (!key)
      return Response.json(
        { error: "Idempotency-Key must contain 8-200 characters." },
        { status: 400 },
      );
    const body = (await request.json().catch(() => null)) as {
      bundle?: unknown;
      scenarioNames?: string[];
    } | null;
    if (
      body?.scenarioNames !== undefined &&
      (!Array.isArray(body.scenarioNames) ||
        body.scenarioNames.some((name) => typeof name !== "string"))
    ) {
      return Response.json(
        { error: "scenarioNames must be an array of strings." },
        { status: 400 },
      );
    }
    const validated = await validateBundle(body?.bundle);
    if (!validated.ok) return copyJSONResponse(validated);
    const validation = (await validated.json()) as { bundle: WorkflowBundle };
    let run: Awaited<ReturnType<typeof runBundle>>;
    try {
      run = await runBundle(
        identity,
        validation.bundle,
        key,
        body?.scenarioNames,
      );
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Invalid scenario selection.",
        },
        { status: 400 },
      );
    }
    const value = await run.response
      .json()
      .catch(() => ({ error: "Runner returned an invalid response." }));
    return Response.json(
      {
        ...(value as object),
        workflowId: run.workflowId,
        workflowRunId: run.workflowRunId,
      },
      { status: run.response.status },
    );
  });
}
