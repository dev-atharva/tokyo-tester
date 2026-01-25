import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

export const inngest = new Inngest({
  id: "cots-orchestrator",
  name: "COTS Container Orchestrator",
  middleware: [realtimeMiddleware()],
});

export type Events = {
  "cots/workflow.start": {
    data: {
      nodes: any[];
      edges: any[];
      workflowName: string;
      userId?: string;
    };
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
      services: any[];
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
      tests: any[];
    };
  };
  "cots/tests.completed": {
    data: {
      sessionId: string;
      results: any;
    };
  };
  "cots/cleanup.execute": {
    data: {
      sessionId: string;
    };
  };
};
