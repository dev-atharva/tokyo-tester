import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return withAgent(request, "read", async (identity) => {
    return Response.json({
      projects: identity.membership ? [identity.membership] : [],
    });
  });
}
