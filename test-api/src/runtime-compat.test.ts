import { expect, test } from "bun:test";

test("fault-lab role loads without payment infrastructure", async () => {
  const module = await import("./fault-lab");
  expect(typeof module.configureFaultLab).toBe("function");
});

test("payment infrastructure loads when Bun lacks the BSON snapshot probe", async () => {
  await import("./bun-mongodb-compat");
  const module = await import("./payment-infra");
  expect(typeof module.PaymentInfra).toBe("function");
});
