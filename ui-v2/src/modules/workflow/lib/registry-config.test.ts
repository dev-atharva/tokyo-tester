import { describe, expect, test } from "bun:test";
import {
  normalizeRegistryHost,
  registryConfigFromForm,
  resolveRegistryImage,
} from "./registry-config";

describe("registry configuration", () => {
  test("preserves nested repository paths", () => {
    expect(
      resolveRegistryImage(
        "registry.example.com:5000",
        "team/platform/payments/api:v1",
      ),
    ).toBe("registry.example.com:5000/team/platform/payments/api:v1");
  });

  test("preserves an already-qualified matching image", () => {
    expect(resolveRegistryImage("ghcr.io", "ghcr.io/acme/apps/api:v2")).toBe(
      "ghcr.io/acme/apps/api:v2",
    );
  });

  test("rejects schemes, paths, invalid ports, and mismatched image hosts", () => {
    expect(() => normalizeRegistryHost("https://ghcr.io")).toThrow();
    expect(() => normalizeRegistryHost("ghcr.io/acme")).toThrow();
    expect(() => normalizeRegistryHost("localhost:70000")).toThrow();
    expect(() =>
      resolveRegistryImage("ghcr.io", "registry.example.com/acme/api:v1"),
    ).toThrow();
  });

  test("removes inactive credential fields", () => {
    expect(
      registryConfigFromForm({
        enabled: true,
        url: "GHCR.IO",
        auth_type: "none",
        username: "stale-user",
        password: "stale-password",
        token: "stale-token",
      }),
    ).toEqual({ url: "ghcr.io", auth_type: "none" });
  });
});
