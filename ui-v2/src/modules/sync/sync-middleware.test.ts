import { describe, expect, test } from "bun:test";
import { coalesceChangeType } from "./sync-middleware";

describe("sync middleware operation tracking", () => {
  test("keeps a newly created entity as an insert when it is immediately updated", () => {
    expect(coalesceChangeType("insert", "update")).toBe("insert");
  });

  test("keeps deletes terminal inside one pending operation window", () => {
    expect(coalesceChangeType("delete", "update")).toBe("delete");
  });

  test("allows delete to supersede an update", () => {
    expect(coalesceChangeType("update", "delete")).toBe("delete");
  });
});
