export const COTS_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export const SCENARIO_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.COTS_SCENARIO_CONCURRENCY ?? "2", 10) || 2,
);

export const PROVISION_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.COTS_PROVISION_TIMEOUT_MS ?? "960000", 10) ||
    960_000,
);

export const TEST_TIMEOUT_MS = Math.max(
  60_000,
  Number.parseInt(process.env.COTS_TEST_TIMEOUT_MS ?? "1860000", 10) ||
    1_860_000,
);

export const CLEANUP_TIMEOUT_MS = Math.max(
  30_000,
  Number.parseInt(process.env.COTS_CLEANUP_TIMEOUT_MS ?? "240000", 10) ||
    240_000,
);

export const CLEANUP_MAX_ATTEMPTS = Math.max(
  1,
  Number.parseInt(process.env.COTS_CLEANUP_MAX_ATTEMPTS ?? "3", 10) || 3,
);
