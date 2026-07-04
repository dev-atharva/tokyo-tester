import { and, eq } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/db";

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
  const connection = getDb();
  const where = and(
    eq(connection.tables.agentTokens.id, tokenId),
    eq(connection.tables.agentTokens.userId, session.user.id),
  );
  if (connection.type === "postgres") {
    await connection.db.delete(connection.tables.agentTokens).where(where);
  } else {
    connection.db.delete(connection.tables.agentTokens).where(where).run();
  }
  return new Response(null, { status: 204 });
}
