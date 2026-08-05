import type { NextRequest } from "next/server";
import { withAgent } from "@/modules/agent/server/http";
import { getRunArtifact } from "@/modules/agent/server/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: {
    params: Promise<{ workflowRunId: string; artifactId: string }>;
  },
) {
  return withAgent(request, "read", async (identity) => {
    const { workflowRunId, artifactId } = await context.params;
    const response = await getRunArtifact(identity, workflowRunId, artifactId);
    if (!response.ok) {
      return Response.json(
        { error: "Screenshot artifact is unavailable." },
        { status: response.status === 410 ? 410 : 404 },
      );
    }
    if (response.headers.get("content-type") !== "image/png") {
      return Response.json(
        { error: "Only non-secret PNG screenshots are available to agents." },
        { status: 404 },
      );
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 4 << 20) {
      return Response.json(
        { error: "Screenshot artifact exceeds the agent response limit." },
        { status: 413 },
      );
    }
    return new Response(bytes, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });
}
