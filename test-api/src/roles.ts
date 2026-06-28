import type { App } from "@tinyhttp/app";
import { validatePayment } from "./domain";
import { PaymentInfra } from "./payment-infra";
import { PaymentService } from "./payment-service";

export async function configurePaymentAPI(app: App) {
  const infra = new PaymentInfra();
  await infra.connect();
  const service = new PaymentService(infra);
  app.get("/health", (_req, res) => res.status(200).json({ status: "healthy", role: "payment-api" }));
  app.get("/ready", (_req, res) => res.status(200).json({ status: "ready", role: "payment-api", dependencies: 8 }));
  app.post("/payments", async (req, res) => {
    try {
      const input = validatePayment(req.body);
      const key = String(req.headers["idempotency-key"] ?? "").trim();
      if (!key) return res.status(400).json({ error: "Idempotency-Key header is required" });
      const payment = await service.create(input, key);
      return res.status(payment.duplicate ? 200 : 202).json(payment);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("risk") ? 422 : message.includes("merchant") ? 404 : 400;
      return res.status(status).json({ error: message });
    }
  });
  app.get("/payments/:payment_id", async (req, res) => {
    const payment = await service.find(req.params.payment_id!);
    return payment ? res.status(200).json(payment) : res.status(404).json({ error: "payment not found" });
  });
  app.get("/payments/:payment_id/wait", async (req, res) => {
    const expected = String(req.query.status ?? "settled");
    const timeoutMs = Math.min(Number(req.query.timeoutMs ?? 20_000), 30_000);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const payment = await service.find(req.params.payment_id!);
      if (payment?.status === expected) return res.status(200).json(payment);
      await Bun.sleep(200);
    }
    return res.status(408).json({ error: `payment did not reach ${expected}` });
  });
  app.get("/payments/:payment_id/audit", async (req, res) => {
    const events = await infra.audit
      .collection("payment_audit")
      .find({ paymentId: req.params.payment_id })
      .sort({ at: 1 })
      .project({ _id: 0 })
      .toArray();
    res.status(200).json({ paymentId: req.params.payment_id, events });
  });
  console.log("payment api ready");
  return () => infra.close();
}

export async function configureWorker() {
  const infra = new PaymentInfra();
  await infra.connect();
  const service = new PaymentService(infra);
  await infra.rabbitChannel!.prefetch(1);
  await infra.rabbitChannel!.consume(infra.config.rabbit.queue, (message) => {
    if (message) void service.handleSettlement(message);
  });
  console.log("settlement worker ready");
  return () => infra.close();
}

export function configureFaultLab(app: App) {
  app.get("/health", (_req, res) => res.status(200).json({ status: "healthy", role: "fault-lab" }));
  app.get("/ready", (_req, res) => res.status(200).json({ status: "ready", role: "fault-lab" }));
  app.get("/faults/status/:code", (req, res) => {
    const code = Math.max(100, Math.min(599, Number(req.params.code)));
    return res.status(code).json({ requestedStatus: code });
  });
  app.get("/faults/delay/:milliseconds", async (req, res) => {
    const milliseconds = Math.max(0, Math.min(30_000, Number(req.params.milliseconds)));
    await Bun.sleep(milliseconds);
    return res.status(200).json({ delayedMs: milliseconds });
  });
  console.log("fault lab ready");
  return async () => {};
}
