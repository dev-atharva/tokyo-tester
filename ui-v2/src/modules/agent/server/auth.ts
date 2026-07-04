import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { userHasProjectAccess } from "@/modules/projects/server/service";

export const AGENT_SCOPES = ["read", "workflow:write", "run"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

export interface AgentIdentity {
  tokenId: string;
  userId: string;
  projectId: string;
  scopes: AgentScope[];
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createAgentToken(input: {
  name: string;
  userId: string;
  projectId: string;
  scopes: AgentScope[];
  expiresAt: Date;
}) {
  const connection = getDb();
  const id = randomUUID();
  const secret = `tt_pat_${randomBytes(32).toString("base64url")}`;
  const record = {
    id,
    name: input.name,
    tokenHash: tokenHash(secret),
    userId: input.userId,
    projectId: input.projectId,
    scopes: JSON.stringify(input.scopes),
    expiresAt: input.expiresAt,
    createdAt: new Date(),
  };
  if (connection.type === "postgres") {
    await connection.db.insert(connection.tables.agentTokens).values(record);
  } else {
    connection.db.insert(connection.tables.agentTokens).values(record).run();
  }
  return { id, token: secret, expiresAt: input.expiresAt.toISOString() };
}

export async function authenticateAgentRequest(
  request: NextRequest,
  requiredScope: AgentScope,
): Promise<AgentIdentity | null> {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  if (!token.startsWith("tt_pat_")) return null;

  const connection = getDb();
  const where = and(
    eq(connection.tables.agentTokens.tokenHash, tokenHash(token)),
    gt(connection.tables.agentTokens.expiresAt, new Date()),
  );
  const rows =
    connection.type === "postgres"
      ? await connection.db
          .select()
          .from(connection.tables.agentTokens)
          .where(where)
          .limit(1)
      : connection.db
          .select()
          .from(connection.tables.agentTokens)
          .where(where)
          .limit(1)
          .all();
  const record = rows[0];
  if (!record) return null;

  let scopes: AgentScope[] = [];
  try {
    scopes = JSON.parse(record.scopes).filter((scope: string) =>
      AGENT_SCOPES.includes(scope as AgentScope),
    );
  } catch {
    return null;
  }
  if (!scopes.includes(requiredScope)) return null;
  if (!(await userHasProjectAccess(record.userId, record.projectId)))
    return null;
  return {
    tokenId: record.id,
    userId: record.userId,
    projectId: record.projectId,
    scopes,
  };
}

export function unauthorizedAgentResponse() {
  return Response.json(
    { error: "A valid project-scoped agent token is required." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}
