import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import {
  createWorkflowRevision,
  listWorkflowRevisions,
} from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return withAgent(request, "read", async (identity) => {
    const { workflowId } = await context.params;
    return listWorkflowRevisions(identity, workflowId);
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ workflowId: string }> },
) {
  return withAgent(request, "workflow:write", async (identity) => {
    const { workflowId } = await context.params;
    const input = (await request.json().catch(() => ({}))) as {
      message?: string;
    };
    return createWorkflowRevision(identity, workflowId, input.message);
  });
}
