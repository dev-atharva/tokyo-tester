import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import {
  getRunIntentForAgent,
  publicRunIntent,
} from "@/modules/agent/server/run-intents";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ runIntentId: string }> },
) {
  return withAgent(request, "read", async (identity) => {
    const { runIntentId } = await context.params;
    const intent = await getRunIntentForAgent(identity, runIntentId);
    if (!intent) {
      return Response.json({ error: "Run intent not found." }, { status: 404 });
    }
    return Response.json(publicRunIntent(intent));
  });
}
