import { afterEach, describe, expect, test } from "bun:test";
import { projectMcpResource, protectedResourceMetadata } from "./mcp-config";

const original = {
  mode: process.env.MCP_AUTH_MODE,
  publicUrl: process.env.MCP_PUBLIC_URL,
  issuer: process.env.MCP_OAUTH_ISSUER,
};

afterEach(() => {
  for (const [name, value] of Object.entries({
    MCP_AUTH_MODE: original.mode,
    MCP_PUBLIC_URL: original.publicUrl,
    MCP_OAUTH_ISSUER: original.issuer,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe("MCP public configuration", () => {
  test("builds an audience-bound project resource in OAuth mode", () => {
    process.env.MCP_AUTH_MODE = "oauth";
    process.env.MCP_PUBLIC_URL = "https://tokyo.example/mcp/";
    expect(projectMcpResource("project one")).toBe(
      "https://tokyo.example/mcp/projects/project%20one",
    );
  });

  test("publishes metadata only for the configured MCP resource", () => {
    process.env.MCP_AUTH_MODE = "oauth";
    process.env.MCP_PUBLIC_URL = "https://tokyo.example/mcp";
    process.env.MCP_OAUTH_ISSUER = "https://id.example/";
    expect(protectedResourceMetadata(["mcp", "projects", "project-1"])).toEqual(
      {
        resource: "https://tokyo.example/mcp/projects/project-1",
        authorization_servers: ["https://id.example"],
        scopes_supported: ["read", "workflow:write", "run"],
        bearer_methods_supported: ["header"],
      },
    );
    expect(protectedResourceMetadata(["another-service"])).toBeNull();
  });
});
