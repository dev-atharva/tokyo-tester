import { describe, expect, test } from "bun:test";
import {
  idempotencyResponse,
  isRetryAllowed,
  nextRetryCount,
  parseRole,
  shouldSettle,
  validatePayment,
} from "./domain";

describe("payment fixture domain", () => {
  test("defaults to the backward-compatible legacy role", () => {
    expect(parseRole(undefined)).toBe("legacy");
    expect(() => parseRole("unknown")).toThrow("Unsupported APP_ROLE");
  });

  test("normalizes valid payment requests", () => {
    expect(
      validatePayment({
        paymentId: "pay-001",
        merchantId: "merchant-demo",
        amount: 1250,
        currency: "usd",
      }),
    ).toEqual({
      paymentId: "pay-001",
      merchantId: "merchant-demo",
      amount: 1250,
      currency: "USD",
    });
  });

  test("rejects unsafe payment values", () => {
    expect(() =>
      validatePayment({ paymentId: "x", merchantId: "", amount: -1, currency: "US" }),
    ).toThrow();
  });

  test("identifies duplicate idempotency results", () => {
    expect(idempotencyResponse(null)).toEqual({ duplicate: false });
    expect(idempotencyResponse({ status: "settled" })).toEqual({
      duplicate: true,
      value: { status: "settled" },
    });
  });

  test("only pending payments transition to settled", () => {
    expect(shouldSettle("pending")).toBe(true);
    expect(shouldSettle("settled")).toBe(false);
  });

  test("bounds settlement retries", () => {
    expect(nextRetryCount({ "x-retry-count": 1 })).toBe(2);
    expect(isRetryAllowed(3)).toBe(true);
    expect(isRetryAllowed(4)).toBe(false);
  });
});
