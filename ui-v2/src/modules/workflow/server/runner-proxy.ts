import type { NextRequest } from "next/server";

const RUNNER_BASE_URL = process.env.COTS_API_BASE_URL || "http://runner:8080";

export function buildRunnerUrl(
  path: string,
  search: string,
  baseUrl = RUNNER_BASE_URL,
): URL {
  const target = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
  target.search = search;
  return target;
}

export async function proxyRunnerRequest(
  request: NextRequest,
  path: string,
  bodyOverride?: BodyInit,
): Promise<Response> {
  const target = buildRunnerUrl(path, request.nextUrl.search);
  const body =
    bodyOverride ??
    (request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.arrayBuffer());
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const lastEventId = request.headers.get("last-event-id");
  if (contentType) headers.set("content-type", contentType);
  if (lastEventId) headers.set("last-event-id", lastEventId);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
    signal: request.signal,
  });
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set("Cache-Control", "no-cache, no-transform");
  responseHeaders.set("X-Accel-Buffering", "no");
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}
