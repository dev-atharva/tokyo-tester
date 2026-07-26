import type { NextRequest } from "next/server";
import { protectedResourceMetadata } from "@/modules/agent/server/mcp-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ resource: string[] }> },
) {
  const { resource } = await context.params;
  const metadata = protectedResourceMetadata(resource);
  if (!metadata) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(metadata, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
