import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { revokeAgentToken } from "@/modules/agent/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ tokenId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { tokenId } = await context.params;
  await revokeAgentToken(session.user.id, tokenId);
  return new Response(null, { status: 204 });
}
