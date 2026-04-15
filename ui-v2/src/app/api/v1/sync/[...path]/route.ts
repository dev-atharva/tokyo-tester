import { type NextRequest, NextResponse } from "next/server";

const RUNNER_SYNC_BASE_URL =
  process.env.COTS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://runner:8080";

function buildTargetUrl(
  request: NextRequest,
  path: string[],
): URL {
  const target = new URL(
    `/api/v1/sync/${path.join("/")}`,
    RUNNER_SYNC_BASE_URL.endsWith("/")
      ? RUNNER_SYNC_BASE_URL
      : `${RUNNER_SYNC_BASE_URL}/`,
  );

  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.append(key, value);
  });

  return target;
}

async function proxyRequest(
  request: NextRequest,
  path: string[],
): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(request, path);
  const contentType = request.headers.get("content-type");
  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      ...(contentType ? { "content-type": contentType } : {}),
    },
    body,
    cache: "no-store",
  });

  const responseText = await response.text();

  return new NextResponse(responseText, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyRequest(request, path);
}
