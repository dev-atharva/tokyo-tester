import { channel, topic } from "@inngest/realtime";
import { z } from "zod";
import type {
  ScenarioTestResultEvent,
  WorkflowLogEvent,
} from "@/modules/workflow/types/react-flow-cots";

export const logsChannel = channel("logs").addTopic(
  topic("workflowlog").type<WorkflowLogEvent>(),
);

export const testResultChannel = channel("testResult").addTopic(
  topic("testresult").schema(
    z.object({
      workflowRunId: z.string(),
      projectId: z.string(),
      workflowId: z.string(),
      scenarioId: z.string(),
      scenarioName: z.string(),
      backendSessionId: z.string().optional(),
      bulkId: z.string(),
      timestamp: z.number(),
      results: z.array(
        z.object({
          testResultId: z.string(),
          testName: z.string(),
          testType: z.string().optional(),
          status: z.string(),
          resultData: z.unknown().optional(),
          durationMs: z.number().optional(),
          executedAt: z.string().optional(),
          action: z.enum(["create", "update"]),
          containerLogs: z.record(z.string()).optional(),
          sequence: z.number(),
        }),
      ),
    }) satisfies z.ZodType<ScenarioTestResultEvent>,
  ),
);
