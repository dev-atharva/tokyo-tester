import type { NextRequest } from "next/server";
import { copyJSONResponse, withAgent } from "@/modules/agent/server/http";
import { validateBundle } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return withAgent(request, "read", async () => {
    const body = await request.json().catch(() => null);
    return copyJSONResponse(
      await validateBundle(
        (body as { bundle?: unknown } | null)?.bundle ?? body,
      ),
    );
  });
}
