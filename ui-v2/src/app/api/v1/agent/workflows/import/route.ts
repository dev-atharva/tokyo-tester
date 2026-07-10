import type { NextRequest } from "next/server";
import {
  copyJSONResponse,
  requiredIdempotencyKey,
  withAgent,
} from "@/modules/agent/server/http";
import { importBundle, validateBundle } from "@/modules/agent/server/service";
import type { WorkflowBundle } from "@/modules/workflow/types/react-flow-cots";

export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  return withAgent(request, "workflow:write", async (identity) => {
    const key = requiredIdempotencyKey(request);
    if (!key)
      return Response.json(
        { error: "Idempotency-Key must contain 8-200 characters." },
        { status: 400 },
      );
    const body = (await request.json().catch(() => null)) as {
      bundle?: unknown;
    } | null;
    const validated = await validateBundle(body?.bundle);
    if (!validated.ok) return copyJSONResponse(validated);
    const validation = (await validated.json()) as { bundle: WorkflowBundle };
    const imported = await importBundle(identity, validation.bundle, key);
    if (!imported.response.ok) return copyJSONResponse(imported.response);
    return Response.json(
      { workflowId: imported.workflowId, created: true },
      { status: 201 },
    );
  });
}
