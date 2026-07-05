import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import { listWorkflows } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return withAgent(request, "read", async (identity) =>
    Response.json({ workflows: await listWorkflows(identity) }),
  );
}
