import { describe, expect, test } from "bun:test";
import { isPublicSitePath } from "./public-paths";

describe("public site paths", () => {
  test.each([
    ["/", true],
    ["/docs", true],
    ["/docs/start/quick-start", true],
    ["/docs/reference/services", true],
    ["/docsish", false],
    ["/agent-setup", false],
    ["/workflow", false],
    ["/admin/users", false],
    ["/login", false],
    ["/setup", false],
  ])("classifies %s", (pathname, expected) => {
    expect(isPublicSitePath(pathname)).toBe(expected);
  });
});
