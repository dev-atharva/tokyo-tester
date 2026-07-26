export const MCP_SCOPES = ["read", "workflow:write", "run"] as const;

export type McpAuthMode = "personal_token" | "oauth";

export function getMcpAuthMode(): McpAuthMode {
  return process.env.MCP_AUTH_MODE === "oauth" ? "oauth" : "personal_token";
}

export function getPublicMcpUrl() {
  const configured = process.env.MCP_PUBLIC_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    url.search = "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, "");
    return url;
  } catch {
    return null;
  }
}

export function projectMcpResource(projectId: string) {
  const base = getPublicMcpUrl();
  if (!base) return null;
  if (getMcpAuthMode() === "oauth") {
    base.pathname = `${base.pathname}/projects/${encodeURIComponent(projectId)}`;
  }
  return base.toString();
}

export function protectedResourceMetadata(resourcePath: string[]) {
  if (getMcpAuthMode() !== "oauth") return null;
  const base = getPublicMcpUrl();
  const issuer = process.env.MCP_OAUTH_ISSUER?.trim();
  if (!base || !issuer) return null;

  const requestedPath = `/${resourcePath.map(encodeURIComponent).join("/")}`;
  const basePath = base.pathname.replace(/\/$/, "");
  if (
    requestedPath !== basePath &&
    !requestedPath.startsWith(`${basePath}/projects/`)
  ) {
    return null;
  }
  const resource = new URL(base.toString());
  resource.pathname = requestedPath;
  return {
    resource: resource.toString(),
    authorization_servers: [issuer.replace(/\/$/, "")],
    scopes_supported: [...MCP_SCOPES],
    bearer_methods_supported: ["header"],
  };
}
