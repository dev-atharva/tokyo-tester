import { App } from "@tinyhttp/app";
import dotenv from "dotenv";
import { json } from "milliparsec";
import { httpPort, role } from "./src/config";

dotenv.config({ override: false });

if (role === "crash-on-start") {
  console.error("intentional startup failure requested");
  process.exit(42);
}

const app = new App();
app.use(json());

let close: () => Promise<unknown>;
if (role === "legacy") {
  const { configureLegacy } = await import("./src/legacy");
  close = await configureLegacy(app);
} else if (role === "payment-api") {
  await import("./src/bun-mongodb-compat");
  const { configurePaymentAPI } = await import("./src/roles");
  close = await configurePaymentAPI(app);
} else if (role === "settlement-worker") {
  await import("./src/bun-mongodb-compat");
  const { configureWorker } = await import("./src/roles");
  close = await configureWorker();
} else {
  const { configureFaultLab } = await import("./src/fault-lab");
  close = configureFaultLab(app);
}

const server = role === "settlement-worker"
  ? null
  : app.listen(httpPort, () => console.log(`${role} listening on http://0.0.0.0:${httpPort}`));

async function shutdown(signal: string) {
  console.log(`received ${signal}; shutting down`);
  server?.close();
  await close();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
