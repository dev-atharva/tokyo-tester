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
  let transientRequests = 0;
  const transientServer = Bun.listen<{ request: string }>({
    hostname: "0.0.0.0",
    port: Number(process.env.TRANSIENT_PORT ?? 8081),
    socket: {
      open(socket) {
        socket.data = { request: "" };
      },
      data(socket, data) {
        socket.data.request += data.toString();
        if (!socket.data.request.includes("\r\n\r\n")) {
          return;
        }
        if (
          !socket.data.request.includes(
            "X-Tokyo-Transient: retry-fixture",
          )
        ) {
          socket.terminate();
          return;
        }
        transientRequests += 1;
        if (transientRequests === 1) {
          socket.write(
            'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 128\r\nConnection: close\r\n\r\n{"recovered":',
          );
          socket.end();
          return;
        }
        const body = JSON.stringify({
          recovered: true,
          attempts: transientRequests,
        });
        socket.write(
          `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
        );
        socket.end();
      },
    },
  });
  console.log("fault lab ready");
  return async () => {
    transientServer.stop();
  };
}
