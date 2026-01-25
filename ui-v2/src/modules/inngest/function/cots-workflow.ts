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

export const logsChannel = channel("logs").addTopic(
  topic("workflowlog").type<WorkflowLogEvent>(),
);

import {
  translateReactFlowToCotsConfig,
  validateFlow,
} from "@/modules/utils/react-flow-translator";

const COTS_API_BASE_URL = "http://localhost:8080";

export const cotsWorkFlow = inngest.createFunction(
  {
    id: "cots-workflow",
    name: "COTS Test Workflow",
    retries: 0,
  },
  { event: "cots/workflow.start" },
  async ({ event, step, publish }) => {
    const input = event.data as WorkflowInput;
    const { sessionId } = input;

    const state: WorkflowState = {
      servicesCreated: false,
      testsExecuted: false,
      cleanUp: false,
      errors: [],
    };

    const log = async (
      message: string,
      status: WorkflowLogEvent["status"] = "running",
      extra?: Partial<WorkflowLogEvent>,
    ) =>
      publish(
        logsChannel().workflowlog({
          sessionId,
          message,
          status,
          ...extra,
        }),
      );

    try {
      await log(`🚀 Starting workflow: ${input.workflowName}`);
      await log(
        `📊 Workflow contains ${input.nodes.length} nodes and ${input.edges.length} connections`,
      );

      /* ---------- Validate ---------- */
      await step.run("validate-flow", async () => {
        await log("🔍 Validating workflow structure...");
        const result = validateFlow(input.nodes, input.edges);

        if (!result.valid) {
          await log(
            `❌ Validation failed: ${result.errors.length} error(s) found`,
          );
          throw new Error(result.errors.map((e) => e.message).join(", "));
        }

        await log("✅ Workflow validation passed");
      });

      /* ---------- Translate ---------- */
      const { services, tests } = await step.run(
        "translate-config",
        async () => {
          await log("🔄 Translating workflow diagram to COTS configuration...");

          // Convert customTestOrder from array back to Map if it exists
          const customTestOrder = input.customTestOrder
            ? new Map<string, string[]>(input.customTestOrder)
            : undefined;

          // Pass custom test order to translator
          const config = translateReactFlowToCotsConfig(
            input.nodes,
            input.edges,
            customTestOrder,
          );

          await log(
            `📦 Generated ${config.services.length} service(s) and ${config.tests.length} test(s)`,
          );

          // Log if custom test order is being used
          if (customTestOrder && customTestOrder.size > 0) {
            await log(
              `🎯 Using custom test execution order for ${customTestOrder.size} node(s)`,
            );
          }

          return config;
        },
      );

      /* ---------- Provision ---------- */
      const cotsSessionId = await step.run("provision-services", async () => {
        await log("🏗️  Provisioning services...");
        const serviceNames = services.map((s) => s.name).join(", ");
        await log(`📋 Services to provision: ${serviceNames}`);

        const res = await fetch(`${COTS_API_BASE_URL}/services`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          await log(`❌ Failed to provision services: ${errorText}`);
          throw new Error(errorText);
        }

        const data: CreateServicesResponse = await res.json();
        state.servicesCreated = true;
        state.sessionId = data.session_id;

        await log(
          `✅ Services provisioned successfully (Session: ${data.session_id.slice(0, 8)}...)`,
        );

        return data.session_id;
      });

      /* ---------- Wait for Services ---------- */
      await log("⏳ Waiting for services to be ready...");
      await step.sleep("wait-for-services", "3s");
      await log("✅ Services are ready");

      /* ---------- Tests ---------- */
      const testResults = await step.run("execute-tests", async () => {
        await log(`🧪 Executing ${tests.length} test(s)...`);

        const res = await fetch(`${COTS_API_BASE_URL}/tests/${cotsSessionId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tests }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          await log(`❌ Test execution failed: ${errorText}`);
          throw new Error(errorText);
        }

        const data: RunTestsResponse = await res.json();
        state.testsExecuted = true;

        await log(
          `📊 Tests completed: ${data.summary.passed} passed, ${data.summary.failed} failed`,
        );

        if (data.summary.failed > 0) {
          await log(`⚠️  Warning: ${data.summary.failed} test(s) failed`);
        } else {
          await log("✅ All tests passed successfully!");
        }

        return data;
      });

      /* ---------- Cleanup ---------- */
      await step.run("cleanup", async () => {
        await log("🧹 Cleaning up resources...");

        const res = await fetch(
          `${COTS_API_BASE_URL}/cleanup/${cotsSessionId}`,
          {
            method: "DELETE",
          },
        );

        if (!res.ok) {
          await log("⚠️  Cleanup encountered issues but continuing...");
        } else {
          await log("✅ Resources cleaned up successfully");
        }

        state.cleanUp = true;
      });

      /* ---------- Completed ---------- */
      const finalMessage =
        testResults.summary.failed === 0
          ? "🎉 Workflow completed successfully!"
          : `⚠️  Workflow completed with ${testResults.summary.failed} failed test(s)`;

      await log(finalMessage, "completed", {
        result: testResults,
      });

      return {
        success: testResults.summary.failed === 0,
        sessionId: cotsSessionId,
        testResults,
      } satisfies WorkflowResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      state.errors ??= [];
      state.errors.push(message);

      await log(`💥 Workflow failed: ${message}`, "failed", {
        error: message,
      });

      if (state.servicesCreated && !state.cleanUp && state.sessionId) {
        await step.run("emergency-cleanup", async () => {
          try {
            await log("🚨 Performing emergency cleanup...");
            await fetch(`${COTS_API_BASE_URL}/cleanup/${state.sessionId}`, {
              method: "DELETE",
            });
            await log("✅ Emergency cleanup completed");
          } catch (cleanupErr) {
            await log(
              "❌ Emergency cleanup failed - manual cleanup may be required",
            );
          }
        });
      }

      throw err;
    }
  },
);
