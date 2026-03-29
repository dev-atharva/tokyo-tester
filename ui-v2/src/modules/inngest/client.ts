import { realtimeMiddleware } from "@inngest/realtime/middleware";
import { Inngest } from "inngest";
import type {
  RunTestsResponse,
  ServiceConfig,
  TestConfig,
  WorkflowInput,
} from "../workflow/types/react-flow-cots";

export const inngest = new Inngest({
  id: "cots-orchestrator",
  name: "COTS Container Orchestrator",
  middleware: [realtimeMiddleware()],
});

export type Events = {
  "cots/workflow.start": {
    data: WorkflowInput;
  };
  "cots/workflow.completed": {
    data: {
      userId?: string;
      workflowName: string;
      sessionId: string;
      success: boolean;
      summary: {
        total: number;
        passed: number;
        failed: number;
      };
    };
  };
  "cots/services.provision": {
    data: {
      services: ServiceConfig[];
    };
  };
  "cots/services.created": {
    data: {
      sessionId: string;
    };
  };
  "cots/tests.execute": {
    data: {
      sessionId: string;
      tests: TestConfig[];
    };
  };
  "cots/tests.completed": {
    data: {
      sessionId: string;
      results: RunTestsResponse;
    };
  };
  "cots/cleanup.execute": {
    data: {
      sessionId: string;
    };
  };
};
