import type { NextRequest } from "next/server";
import { copyJSONResponse, withAgent } from "@/modules/agent/server/http";
import { getCapabilities } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  return withAgent(request, "read", async () =>
    copyJSONResponse(await getCapabilities()),
  );
}
