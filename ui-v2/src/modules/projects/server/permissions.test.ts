import { describe, expect, test } from "bun:test";
import { allowedActionsForRole } from "./service";

describe("project role permissions", () => {
  test("keeps runner access read-only but executable", () => {
    expect(allowedActionsForRole("runner")).toEqual(["view", "run"]);
  });

  test("allows editors to mutate workflows without managing members", () => {
    expect(allowedActionsForRole("editor")).toEqual(["view", "edit", "run"]);
  });

  test("allows owners to manage membership", () => {
    expect(allowedActionsForRole("owner")).toContain("manage");
  });
});
