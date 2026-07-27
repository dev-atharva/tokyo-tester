import { createHmac, timingSafeEqual } from "node:crypto";
import type { AgentScope } from "./auth";

const ASSERTION_ISSUER = "tokyo-mcp";
const ASSERTION_AUDIENCE = "tokyo-ui-agent-api";

export interface AgentAssertionClaims {
  sub: string;
  email?: string;
  user_id?: string;
  project_id: string;
  scopes: AgentScope[];
  iss: typeof ASSERTION_ISSUER;
  aud: typeof ASSERTION_AUDIENCE;
  iat: number;
  exp: number;
}

function decodePart(value: string) {
  return Buffer.from(value, "base64url");
}

function signature(secret: string, value: string) {
  return createHmac("sha256", secret).update(value).digest();
}

export function verifyAgentAssertion(
  assertion: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): AgentAssertionClaims | null {
  if (secret.length < 32) return null;
  const parts = assertion.split(".");
  if (parts.length !== 3) return null;
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const expected = signature(secret, signingInput);
  let received: Buffer;
  try {
    received = decodePart(encodedSignature);
  } catch {
    return null;
  }
  if (
    received.length !== expected.length ||
    !timingSafeEqual(received, expected)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(decodePart(encodedHeader).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    const claims = JSON.parse(
      decodePart(encodedPayload).toString("utf8"),
    ) as Partial<AgentAssertionClaims>;
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;
    if (
      claims.iss !== ASSERTION_ISSUER ||
      claims.aud !== ASSERTION_AUDIENCE ||
      typeof claims.sub !== "string" ||
      typeof claims.project_id !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number" ||
      claims.iat > now + 30 ||
      claims.exp <= now ||
      claims.exp - claims.iat > 120 ||
      !Array.isArray(claims.scopes) ||
      claims.scopes.some(
        (scope) => !["read", "workflow:write", "run"].includes(String(scope)),
      )
    ) {
      return null;
    }
    return claims as AgentAssertionClaims;
  } catch {
    return null;
  }
}

export const agentAssertionContract = {
  issuer: ASSERTION_ISSUER,
  audience: ASSERTION_AUDIENCE,
};
