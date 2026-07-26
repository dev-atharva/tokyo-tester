import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  agentAssertionContract,
  verifyAgentAssertion,
} from "./internal-assertion";

const secret = "a-production-length-internal-secret-value";

function assertion(payload: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({ alg: "HS256", typ: "JWT" }),
  ).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const input = `${header}.${body}`;
  const signature = createHmac("sha256", secret)
    .update(input)
    .digest("base64url");
  return `${input}.${signature}`;
}

describe("agent internal assertion", () => {
  test("accepts a short-lived audience-bound assertion", () => {
    const value = assertion({
      sub: "subject-1",
      email: "user@example.com",
      project_id: "project-1",
      scopes: ["read", "run"],
      iss: agentAssertionContract.issuer,
      aud: agentAssertionContract.audience,
      iat: 100,
      exp: 160,
    });
    expect(verifyAgentAssertion(value, secret, 120)?.project_id).toBe(
      "project-1",
    );
  });

  test("rejects tampering, wrong audiences, and long lifetimes", () => {
    const base = {
      sub: "subject-1",
      project_id: "project-1",
      scopes: ["read"],
      iss: agentAssertionContract.issuer,
      aud: agentAssertionContract.audience,
      iat: 100,
      exp: 160,
    };
    const valid = assertion(base);
    expect(verifyAgentAssertion(`${valid}x`, secret, 120)).toBeNull();
    expect(
      verifyAgentAssertion(
        assertion({ ...base, aud: "another-service" }),
        secret,
        120,
      ),
    ).toBeNull();
    expect(
      verifyAgentAssertion(assertion({ ...base, exp: 300 }), secret, 120),
    ).toBeNull();
  });
});
