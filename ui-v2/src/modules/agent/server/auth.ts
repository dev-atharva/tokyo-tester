import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { getUserByEmail, getUserById } from "@/modules/auth/server/repository";
import { getProjectMembership } from "@/modules/projects/server/service";
import type { ProjectMembership } from "@/modules/projects/types";
import { verifyAgentAssertion } from "./internal-assertion";
import { getMcpAuthMode } from "./mcp-config";

export const AGENT_SCOPES = ["read", "workflow:write", "run"] as const;
export type AgentScope = (typeof AGENT_SCOPES)[number];

const SCOPE_ACTION = {
  read: "view",
  "workflow:write": "edit",
  run: "run",
} as const;

export async function availableAgentScopes(
  userId: string,
  projectId: string,
  platformRole?: string | null,
): Promise<AgentScope[]> {
  const membership = await getProjectMembership(
    userId,
    projectId,
    platformRole,
  );
  if (!membership) return [];
  return AGENT_SCOPES.filter((scope) =>
    membership.allowedActions.includes(SCOPE_ACTION[scope]),
  );
}

export interface AgentIdentity {
  tokenId: string;
  userId: string;
  projectId: string;
  scopes: AgentScope[];
  membership?: ProjectMembership;
}

export interface AgentTokenListItem {
  id: string;
  name: string;
  projectId: string;
  scopes: AgentScope[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
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
  await connection.db.insert(connection.tables.agentTokens).values(record);
  return { id, token: secret, expiresAt: input.expiresAt.toISOString() };
}

function parseScopes(value: unknown): AgentScope[] | null {
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((scope): scope is AgentScope =>
      AGENT_SCOPES.includes(scope as AgentScope),
    );
  } catch {
    return null;
  }
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function listAgentTokens(
  userId: string,
): Promise<AgentTokenListItem[]> {
  const connection = getDb();
  const rows = await connection.db
    .select()
    .from(connection.tables.agentTokens)
    .where(eq(connection.tables.agentTokens.userId, userId))
    .orderBy(desc(connection.tables.agentTokens.createdAt));
  return rows.map((record: Record<string, unknown>) => ({
    id: String(record.id),
    name: String(record.name),
    projectId: String(record.projectId),
    scopes: parseScopes(record.scopes) ?? [],
    createdAt: iso(record.createdAt) ?? new Date(0).toISOString(),
    expiresAt: iso(record.expiresAt) ?? new Date(0).toISOString(),
    lastUsedAt: iso(record.lastUsedAt),
    revokedAt: iso(record.revokedAt),
  }));
}

export async function revokeAgentToken(userId: string, tokenId: string) {
  const connection = getDb();
  await connection.db
    .update(connection.tables.agentTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(connection.tables.agentTokens.id, tokenId),
        eq(connection.tables.agentTokens.userId, userId),
        isNull(connection.tables.agentTokens.revokedAt),
      ),
    );
}

export async function authenticatePersonalAgentToken(
  token: string,
): Promise<AgentIdentity | null> {
  if (!token.startsWith("tt_pat_")) return null;
  const connection = getDb();
  const rows = await connection.db
    .select()
    .from(connection.tables.agentTokens)
    .where(
      and(
        eq(connection.tables.agentTokens.tokenHash, tokenHash(token)),
        gt(connection.tables.agentTokens.expiresAt, new Date()),
        isNull(connection.tables.agentTokens.revokedAt),
      ),
    )
    .limit(1);
  const record = rows[0];
  if (!record) return null;
  const scopes = parseScopes(record.scopes);
  if (!scopes) return null;
  const user = await getUserById(record.userId);
  if (!user?.isActive) return null;
  const membership = await getProjectMembership(
    record.userId,
    record.projectId,
    user.role,
  );
  if (!membership) return null;
  const effectiveScopes = scopes.filter((scope) =>
    membership.allowedActions.includes(SCOPE_ACTION[scope]),
  );
  if (effectiveScopes.length === 0) return null;
  if (
    !record.lastUsedAt ||
    record.lastUsedAt.getTime() < Date.now() - 5 * 60_000
  ) {
    await connection.db
      .update(connection.tables.agentTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(connection.tables.agentTokens.id, record.id));
  }
  return {
    tokenId: record.id,
    userId: record.userId,
    projectId: record.projectId,
    scopes: effectiveScopes,
    membership,
  };
}

export async function authenticateAgentRequest(
  request: NextRequest,
  requiredScopes: AgentScope | AgentScope[],
): Promise<AgentIdentity | null> {
  const assertion = request.headers.get("x-tokyo-agent-assertion")?.trim();
  if (assertion) {
    const claims = verifyAgentAssertion(
      assertion,
      process.env.MCP_INTERNAL_SECRET ?? "",
    );
    if (!claims) return null;
    const user = claims.user_id
      ? await getUserById(claims.user_id)
      : claims.email
        ? await getUserByEmail(claims.email.trim().toLowerCase())
        : null;
    if (!user?.isActive) return null;
    const required = Array.isArray(requiredScopes)
      ? requiredScopes
      : [requiredScopes];
    if (!required.every((scope) => claims.scopes.includes(scope))) return null;
    const membership = await getProjectMembership(
      user.id,
      claims.project_id,
      user.role,
    );
    if (!membership) return null;
    for (const scope of required) {
      if (!membership.allowedActions.includes(SCOPE_ACTION[scope])) return null;
    }
    return {
      tokenId: `assertion:${claims.sub}`,
      userId: user.id,
      projectId: claims.project_id,
      scopes: claims.scopes,
      membership,
    };
  }

  if (getMcpAuthMode() === "oauth") return null;
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";
  const identity = await authenticatePersonalAgentToken(token);
  if (!identity) return null;
  const required = Array.isArray(requiredScopes)
    ? requiredScopes
    : [requiredScopes];
  if (!required.every((scope) => identity.scopes.includes(scope))) return null;
  for (const scope of required) {
    if (!identity.membership?.allowedActions.includes(SCOPE_ACTION[scope])) {
      return null;
    }
  }
  return identity;
}

export function unauthorizedAgentResponse() {
  return Response.json(
    { error: "A valid project-scoped agent token is required." },
    { status: 401, headers: { "WWW-Authenticate": "Bearer" } },
  );
}
