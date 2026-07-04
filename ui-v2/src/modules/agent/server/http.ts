import type { NextRequest } from "next/server";
import {
  type AgentScope,
  authenticateAgentRequest,
  unauthorizedAgentResponse,
} from "./auth";

export async function withAgent(
  request: NextRequest,
  scope: AgentScope,
  handler: (
    identity: NonNullable<Awaited<ReturnType<typeof authenticateAgentRequest>>>,
  ) => Promise<Response>,
) {
  const identity = await authenticateAgentRequest(request, scope);
  if (!identity) return unauthorizedAgentResponse();
  return handler(identity);
}

export async function copyJSONResponse(
  response: Response,
  transform?: (value: unknown) => unknown,
) {
  const value = await response.json().catch(() => ({
    error: "Tokyo Tester service returned an invalid response.",
  }));
  return Response.json(transform ? transform(value) : value, {
    status: response.status,
  });
}

export function requiredIdempotencyKey(request: NextRequest) {
  const key = request.headers.get("idempotency-key")?.trim() ?? "";
  return key.length >= 8 && key.length <= 200 ? key : null;
}
