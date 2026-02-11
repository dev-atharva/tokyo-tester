import {
  CreateServicesResponse,
  RunTestsResponse,
  WorkflowInput,
  WorkflowLogEvent,
  WorkflowResult,
  WorkflowState,
} from "@/modules/workflow/types/react-flow-cots";
import { inngest } from "../client";
import { channel, topic } from "@inngest/realtime";
import { z } from "zod";

import {
  translateReactFlowToCotsConfig,
  validateFlow,
} from "@/modules/utils/react-flow-translator";

const COTS_API_BASE_URL = "http://localhost:8080";

/* ---------------- Realtime Channel ---------------- */

export const logsChannel = channel("logs").addTopic(
  topic("workflowlog").type<WorkflowLogEvent>(),
);

export const testResultChannel = channel("testResult").addTopic(
  topic("testresult").schema(
    z.object({
      sessionId: z.string(),
      workflowId: z.string(),
      results: z.array(
        z.object({
          testResultId: z.string(),
          testName: z.string(),
          testType: z.string().optional(),
          status: z.string(),
          resultData: z.any().optional(),
          durationMs: z.number().optional(),
          executedAt: z.string().optional(),
          action: z.enum(["create", "update"]),
        }),
      ),
    }),
  ),
);

/* ---------------- Workflow ---------------- */

export const cotsWorkFlow = inngest.createFunction(
  {
    id: "cots-workflow",
    name: "COTS Test Workflow",
    retries: 0,
  },
  { event: "cots/workflow.start" },
  async ({ event, step, publish }) => {
    const input = event.data as WorkflowInput;
    const { sessionId, workflowId } = input;

    const state: WorkflowState = {
      servicesCreated: false,
      testsExecuted: false,
      cleanUp: false,
      errors: [],
    };

    /* ---------- Helpers ---------- */

    const log = async (
      message: string,
      status: WorkflowLogEvent["status"] = "running",
      extra?: Partial<WorkflowLogEvent>,
    ) => {
      return publish(
        logsChannel().workflowlog({
          sessionId,
          message,
          status,
          ...extra,
        }),
      );
    };

    const emitTestResultsBulk = async (
      results: Array<{
        testResultId: string;
        testName: string;
        testType?: string;
        status: string;
        resultData?: any;
        durationMs?: number;
        executedAt?: string;
        action: "create" | "update";
      }>,
    ) => {
      if (results.length === 0) return;

      console.log(`Emitting ${results.length} test results in bulk`);

      const payload = {
        sessionId,
        workflowId,
        results: results.map((r) => ({
          testResultId: r.testResultId,
          testName: r.testName,
          testType: r.testType || "database",
          status: r.status,
          resultData: r.resultData ?? null,
          durationMs: r.durationMs ?? 0,
          executedAt: r.executedAt || new Date().toISOString(),
          action: r.action,
        })),
      };

      console.log("Bulk payload:", JSON.stringify(payload, null, 2));

      return publish(testResultChannel()["testresult"](payload));
    };

    try {
      await log(`Starting workflow: ${input.workflowName}`);
      await log(
        `Workflow contains ${input.nodes.length} nodes and ${input.edges.length} connections`,
      );

      /* ---------- Validate ---------- */
      await step.run("validate-flow", async () => {
        await log("Validating workflow structure...");
        const result = validateFlow(input.nodes, input.edges);

        if (!result.valid) {
          throw new Error(result.errors.map((e) => e.message).join(", "));
        }

        await log("Workflow validation passed");
      });

      /* ---------- Translate ---------- */
      const { services, tests } = await step.run(
        "translate-config",
        async () => {
          await log("Translating workflow diagram to COTS configuration...");

          const customTestOrder = input.customTestOrder
            ? new Map<string, string[]>(input.customTestOrder)
            : undefined;

          const config = translateReactFlowToCotsConfig(
            input.nodes,
            input.edges,
            customTestOrder,
          );

          await log(
            `Generated ${config.services.length} service(s) and ${config.tests.length} test(s)`,
          );

          return config;
        },
      );

      /* ---------- Provision ---------- */
      const cotsSessionId = await step.run("provision-services", async () => {
        await log("Provisioning services...");

        const res = await fetch(`${COTS_API_BASE_URL}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services }),
        });

        if (!res.ok) {
          throw new Error(await res.text());
        }

        const data: CreateServicesResponse = await res.json();
        state.servicesCreated = true;
        state.sessionId = data.session_id;

        await log(
          `Services provisioned (Session: ${data.session_id.slice(0, 8)}...)`,
        );

        return data.session_id;
      });

      /* ---------- Wait ---------- */
      await log("Waiting for services to be ready...");
      await step.sleep("wait-for-services", "3s");
      await log("Services are ready");

      /* ---------- Execute Tests ---------- */
      const testResults = await step.run(
        "execute-tests-with-tracking",
        async () => {
          await log(`📝 Creating ${tests.length} test result placeholder(s)`);

          // 1️⃣ Create placeholders for all tests in bulk
          const placeholders = tests.map((test) => ({
            testResultId: `${sessionId}_${test.name}`,
            testName: test.name,
            testType: test.type || "database",
            status: "pending",
            durationMs: 0,
            executedAt: new Date().toISOString(),
            resultData: null,
            action: "create" as const,
          }));

          await emitTestResultsBulk(placeholders);

          await log(`🧪 Executing ${tests.length} test(s)...`);

          const runningUpdates = tests.map((test) => ({
            testResultId: `${sessionId}_${test.name}`,
            testName: test.name,
            testType: test.type || "database",
            status: "running",
            durationMs: 0,
            executedAt: new Date().toISOString(),
            resultData: null,
            action: "update" as const,
          }));

          await emitTestResultsBulk(runningUpdates);

          const res = await fetch(
            `${COTS_API_BASE_URL}/tests/${cotsSessionId}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tests }),
            },
          );

          if (!res.ok) {
            throw new Error(await res.text());
          }

          const data: RunTestsResponse = await res.json();
          state.testsExecuted = true;

          console.log("RAW API RESPONSE:", JSON.stringify(data, null, 2));
          console.log("Number of results:", data.results.length);
          console.log(
            "Result names:",
            data.results.map((r) => r.name),
          );

          await log(
            `Tests completed: ${data.summary.passed} passed, ${data.summary.failed} failed`,
          );

          // Collect all final results
          const finalResults = data.results
            .map((result) => {
              const test = tests.find((t) => t.name === result.name);
              if (!test || !test.name) {
                console.warn("Missing test for result:", result.name);
                return null;
              }

              return {
                testResultId: `${sessionId}_${test.name}`,
                testName: result.name,
                testType: result.type || "database",
                status: result.passed ? "passed" : "failed",
                durationMs: result.duration || 0,
                executedAt: new Date().toISOString(),
                resultData: result,
                action: "update" as const,
              };
            })
            .filter((r): r is NonNullable<typeof r> => r !== null);

          console.log(
            `Prepared ${finalResults.length} final results for emission`,
          );

          // Emit all final results in bulk
          await emitTestResultsBulk(finalResults);

          // Log individual test results
          for (const result of data.results) {
            const emoji = result.passed ? "✅" : "❌";
            await log(
              `${emoji} ${result.name}: ${result.passed ? "passed" : "failed"} (${
                result.duration || 0
              }ms)`,
            );
          }

          return data;
        },
      );

      await step.sleep("wait-for-emissions", "500ms");

      /* ---------- Cleanup ---------- */
      await step.run("cleanup", async () => {
        await log("Cleaning up resources...");
        await fetch(`${COTS_API_BASE_URL}/cleanup/${cotsSessionId}`, {
          method: "DELETE",
        });
        state.cleanUp = true;
        await log("Cleanup complete");
      });

      await log(
        testResults.summary.failed === 0
          ? "Workflow completed successfully!"
          : `Workflow completed with ${testResults.summary.failed} failed test(s)`,
        "completed",
        { result: testResults },
      );

      return {
        success: testResults.summary.failed === 0,
        sessionId: cotsSessionId,
        testResults,
      } satisfies WorkflowResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      await log(`Workflow failed: ${message}`, "failed", {
        error: message,
      });

      if (state.servicesCreated && !state.cleanUp && state.sessionId) {
        await fetch(`${COTS_API_BASE_URL}/cleanup/${state.sessionId}`, {
          method: "DELETE",
        });
      }

      throw err;
    }
  },
);
