import { mkdir, rename, writeFile } from "node:fs/promises";
import readline from "node:readline";
import { chromium } from "playwright";

const artifactDir = "/artifacts";
const maxEventBytes = 16 * 1024;
let browser;
let shuttingDown = false;

function emit(event) {
  const line = JSON.stringify(event);
  if (Buffer.byteLength(line) > maxEventBytes) {
    process.stdout.write(`${JSON.stringify({ type: "protocol_error", code: "event_too_large" })}\n`);
    return;
  }
  process.stdout.write(`${line}\n`);
}

function redactor(secrets) {
  const values = Object.values(secrets ?? {}).filter((value) => typeof value === "string" && value.length > 0);
  return (input) => {
    let output = String(input ?? "");
    for (const secret of values) output = output.split(secret).join("[REDACTED]");
    return output.slice(0, 2048);
  };
}

function locatorFor(page, locator) {
  switch (locator.strategy) {
    case "role": return page.getByRole(locator.role, { name: locator.name, exact: locator.exact });
    case "label": return page.getByLabel(locator.value, { exact: locator.exact });
    case "text": return page.getByText(locator.value, { exact: locator.exact });
    case "testId": return page.getByTestId(locator.value);
    default: throw new Error(`unsupported locator strategy: ${locator.strategy}`);
  }
}

async function writeManifest(manifest) {
  const temporary = `${artifactDir}/result.json.tmp`;
  await writeFile(temporary, JSON.stringify(manifest), { mode: 0o600 });
  await rename(temporary, `${artifactDir}/result.json`);
}

async function executeStep(page, step, request) {
  const timeout = step.timeoutMs ?? 5000;
  if (step.kind === "action" && step.action.operation === "navigate") {
    await page.goto(new URL(step.action.path, request.baseURL).toString(), { timeout });
    return;
  }
  if (step.kind === "action" && step.action.operation === "fill") {
    const source = step.action.value;
    const value = source.source === "run-secret" ? request.secrets?.[source.secretRef] : source.value;
    if (value === undefined) throw new Error(`missing run secret reference: ${source.secretRef}`);
    await locatorFor(page, step.action.locator).fill(value, { timeout });
    return;
  }
  if (step.kind === "action" && step.action.operation === "click") {
    await locatorFor(page, step.action.locator).click({ timeout });
    return;
  }
  if (step.kind === "assertion" && step.assertion.operation === "visible") {
    await locatorFor(page, step.assertion.locator).waitFor({ state: "visible", timeout });
    return;
  }
  if (step.kind === "assertion" && step.assertion.operation === "url") {
    const expected = new URL(step.assertion.path, request.baseURL);
    await page.waitForURL((actual) => {
      if (actual.pathname !== expected.pathname) return false;
      for (const [key, value] of Object.entries(step.assertion.query ?? {})) {
        if (actual.searchParams.get(key) !== value) return false;
      }
      return true;
    }, { timeout });
    return;
  }
  if (step.kind === "control" && step.control.operation === "delay") {
    await page.waitForTimeout(step.control.durationMs);
    return;
  }
  throw new Error("unsupported browser journey step");
}

async function runJourney(request) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const redact = redactor(request.secrets);
  const containsSecrets = Object.keys(request.secrets ?? {}).length > 0;
  const context = await browser.newContext();
  const page = await context.newPage();
  const steps = [];
  let failure;
  let screenshot;
  let trace;

  if (!containsSecrets) await context.tracing.start({ screenshots: true, snapshots: true, sources: false });
  try {
    for (const [sequence, step] of (request.steps ?? []).entries()) {
      const stepStartedAt = new Date().toISOString();
      const stepStarted = Date.now();
      emit({ type: "step", id: step.id, sequence, state: "running" });
      try {
        await executeStep(page, step, request);
        const result = { id: step.id, sequence, state: "passed", startedAt: stepStartedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted };
        steps.push(result);
        emit({ type: "step", ...result });
      } catch (error) {
        failure = { id: step.id, sequence, code: "step_failed", message: redact(error?.message) };
        const result = { id: step.id, sequence, state: "failed", startedAt: stepStartedAt, completedAt: new Date().toISOString(), durationMs: Date.now() - stepStarted, error: failure };
        steps.push(result);
        emit({ type: "step", ...result });
        break;
      }
    }

    if (failure && !containsSecrets) {
      screenshot = "failure.png";
      await page.screenshot({ path: `${artifactDir}/${screenshot}`, type: "png" }).catch(() => { screenshot = undefined; });
      trace = "trace.zip";
      await context.tracing.stop({ path: `${artifactDir}/${trace}` }).catch(() => { trace = undefined; });
    } else if (!containsSecrets) {
      await context.tracing.stop().catch(() => {});
    }

    const manifest = {
      protocolVersion: 1,
      success: !failure,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      finalURL: page.url(),
      steps,
      failure,
      artifacts: { screenshot, trace },
      evidenceSuppressed: containsSecrets,
    };
    await writeManifest(manifest);
    emit({ type: "result_ready", success: manifest.success, manifest: "result.json" });
  } finally {
    await context.close().catch(() => {});
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  emit({ type: "shutdown", signal });
  await browser?.close().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await mkdir(artifactDir, { recursive: true });
browser = await chromium.launch({ headless: true, chromiumSandbox: process.env.TOKYO_CHROMIUM_SANDBOX !== "false" });
emit({ type: "ready", protocolVersion: 1 });

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let handled = false;
for await (const line of lines) {
  if (!line.trim()) continue;
  if (handled) { emit({ type: "protocol_error", code: "duplicate_request" }); break; }
  handled = true;
  try {
    await runJourney(JSON.parse(line));
  } catch (error) {
    const manifest = { protocolVersion: 1, success: false, failure: { code: "executor_error", message: String(error?.message ?? error).slice(0, 2048) }, artifacts: {}, steps: [] };
    await writeManifest(manifest);
    emit({ type: "result_ready", success: false, manifest: "result.json" });
  }
  await new Promise((resolve) => setTimeout(resolve, 30000));
  break;
}
await shutdown("stdin_closed");
