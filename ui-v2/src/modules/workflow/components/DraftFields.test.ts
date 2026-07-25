import { describe, expect, test } from "bun:test";
import { resolveJsonDraft, resolveNumberDraft } from "./DraftFields";

describe("draft-aware workflow fields", () => {
  test("keeps incomplete JSON as an invalid draft instead of replacing it", () => {
    expect(
      resolveJsonDraft("{", (value) => JSON.parse(value) as object),
    ).toEqual({ status: "invalid" });
  });

  test("commits valid JSON and treats a blank editor as an unset value", () => {
    expect(
      resolveJsonDraft('{"status":"healthy"}', (value) => JSON.parse(value)),
    ).toEqual({ status: "valid", value: { status: "healthy" } });
    expect(resolveJsonDraft("  ", JSON.parse)).toEqual({
      status: "valid",
      value: undefined,
    });
  });

  test("allows an empty numeric draft while committing finite numbers", () => {
    expect(resolveNumberDraft("")).toEqual({ status: "incomplete" });
    expect(resolveNumberDraft("-")).toEqual({ status: "incomplete" });
    expect(resolveNumberDraft("250")).toEqual({
      status: "valid",
      value: 250,
    });
  });
});
