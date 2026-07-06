import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import { restoreWorkflowRevision } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string; revisionId: string }> },
) {
  return withAgent(request, "workflow:write", async (identity) => {
    const { workflowId, revisionId } = await context.params;
    const input = (await request.json().catch(() => ({}))) as {
      expectedVersion?: number;
    };
    if (
      !Number.isInteger(input.expectedVersion) ||
      Number(input.expectedVersion) < 1
    ) {
      return Response.json(
        { error: "expectedVersion is required." },
        { status: 400 },
      );
    }
    return restoreWorkflowRevision(
      identity,
      workflowId,
      revisionId,
      Number(input.expectedVersion),
    );
  });
}
