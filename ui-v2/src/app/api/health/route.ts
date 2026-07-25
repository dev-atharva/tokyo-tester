import { NextResponse } from "next/server";
import { getDb } from "@/db";

async function checkDatabase() {
  const connection = getDb();
  switch (connection.type) {
    case "postgres":
      await connection.client.unsafe("SELECT 1");
      return;
    case "mysql":
      await connection.client.query("SELECT 1");
      return;
  }
}

async function checkRunner() {
  const runnerURL = new URL(
    "/health",
    process.env.COTS_API_BASE_URL ?? "http://runner:8080",
  );
  const response = await fetch(runnerURL, {
    cache: "no-store",
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error("runner is not ready");
}

export async function GET() {
  const checks = await Promise.allSettled([checkDatabase(), checkRunner()]);
  const failed = checks
    .map((result, index) => ({
      result,
      dependency: index === 0 ? "database" : "runner",
    }))
    .filter(({ result }) => result.status === "rejected")
    .map(({ dependency }) => dependency);

  return NextResponse.json(
    {
      status: failed.length === 0 ? "ok" : "unhealthy",
      dependencies: {
        database: failed.includes("database") ? "unavailable" : "ready",
        runner: failed.includes("runner") ? "unavailable" : "ready",
      },
      timestamp: new Date().toISOString(),
    },
    { status: failed.length === 0 ? 200 : 503 },
  );
}
