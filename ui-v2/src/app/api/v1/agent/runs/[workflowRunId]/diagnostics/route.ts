import type { NextRequest } from "next/server";
import { copyJSONResponse, withAgent } from "@/modules/agent/server/http";
import { compactRunDiagnostics, getRun } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowRunId: string }> },
) {
  return withAgent(request, "read", async (identity) => {
    const { workflowRunId } = await context.params;
    return copyJSONResponse(
      await getRun(identity, workflowRunId),
      compactRunDiagnostics,
    );
  });
}
