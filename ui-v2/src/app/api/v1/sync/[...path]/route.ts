import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { userHasProjectAccess } from "@/modules/projects/server/service";
import { bindSyncBatchToIdentity } from "@/modules/workflow/server/authorized-request";

const RUNNER_SYNC_BASE_URL =
  process.env.COTS_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://runner:8080";

function buildTargetUrl(request: NextRequest, path: string[]): URL {
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
  bodyOverride?: string,
  identity?: { userId: string; projectId: string },
): Promise<NextResponse> {
  const targetUrl = buildTargetUrl(request, path);
  if (identity) {
    targetUrl.searchParams.set("userId", identity.userId);
    targetUrl.searchParams.set("projectId", identity.projectId);
  }
  const contentType = request.headers.get("content-type");
  const body =
    bodyOverride ??
    (request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text());

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

async function authorizeProject(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (
    !projectId ||
    !(await userHasProjectAccess(session.user.id, projectId, session.user.role))
  ) {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { userId: session.user.id, projectId };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path[0] === "status") {
    const session = await auth();
    return session?.user?.id
      ? proxyRequest(request, path)
      : NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await authorizeProject(
    request.nextUrl.searchParams.get("projectId") ?? "",
  );
  if ("response" in access) return access.response;
  return proxyRequest(request, path, undefined, access);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.clone().json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid sync request" },
      { status: 400 },
    );
  }
  const projectId = typeof body.project_id === "string" ? body.project_id : "";
  const access = await authorizeProject(projectId);
  if ("response" in access) return access.response;
  const trustedBody = bindSyncBatchToIdentity(
    body,
    access.userId,
    access.projectId,
  );
  return proxyRequest(request, path, JSON.stringify(trustedBody), access);
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const access = await authorizeProject(
    request.nextUrl.searchParams.get("projectId") ?? "",
  );
  if ("response" in access) return access.response;
  return proxyRequest(request, path, undefined, access);
}
