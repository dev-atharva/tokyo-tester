import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import {
  getExistingWorkflow,
  redactSensitive,
} from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return withAgent(request, "read", async (identity) => {
    const { workflowId } = await context.params;
    const result = await getExistingWorkflow(identity, workflowId);
    return result
      ? Response.json(redactSensitive(result))
      : Response.json({ error: "Workflow not found." }, { status: 404 });
  });
}
