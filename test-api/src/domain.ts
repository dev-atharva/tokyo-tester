export type AppRole =
  | "legacy"
  | "payment-api"
  | "settlement-worker"
  | "fault-lab"
  | "crash-on-start";

export interface PaymentRequest {
  paymentId: string;
  merchantId: string;
  amount: number;
  currency: string;
}

export function parseRole(value: string | undefined): AppRole {
  const role = value?.trim() || "legacy";
  if (
    role === "legacy" ||
    role === "payment-api" ||
    role === "settlement-worker" ||
    role === "fault-lab" ||
    role === "crash-on-start"
  ) {
    return role;
  }
  throw new Error(`Unsupported APP_ROLE: ${role}`);
}

export function validatePayment(value: unknown): PaymentRequest {
  if (!value || typeof value !== "object") {
    throw new Error("payment body must be an object");
  }
  const input = value as Record<string, unknown>;
  const paymentId = typeof input.paymentId === "string" ? input.paymentId.trim() : "";
  const merchantId = typeof input.merchantId === "string" ? input.merchantId.trim() : "";
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  const amount = typeof input.amount === "number" ? input.amount : Number.NaN;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,63}$/.test(paymentId)) {
    throw new Error("paymentId must be 3-64 URL-safe characters");
  }
  if (!merchantId) throw new Error("merchantId is required");
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("amount must be a positive integer in minor currency units");
  }
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("currency must be a three-letter code");
  return { paymentId, merchantId, amount, currency };
}

export function shouldSettle(status: string): boolean {
  return status === "pending";
}

export function nextRetryCount(headers: Record<string, unknown> | undefined): number {
  const raw = headers?.["x-retry-count"];
  const current = typeof raw === "number" ? raw : Number(raw ?? 0);
  return Number.isFinite(current) && current >= 0 ? Math.floor(current) + 1 : 1;
}

export function isRetryAllowed(nextCount: number, maximum = 3): boolean {
  return nextCount <= maximum;
}

export function idempotencyResponse<T>(existing: T | null): { duplicate: boolean; value?: T } {
  return existing === null ? { duplicate: false } : { duplicate: true, value: existing };
}
