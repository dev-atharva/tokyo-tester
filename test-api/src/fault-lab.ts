import type { App } from "@tinyhttp/app";

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
