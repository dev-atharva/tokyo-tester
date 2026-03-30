import { realtimeMiddleware } from "@inngest/realtime/middleware";
import { Inngest } from "inngest";
import type {
  RunTestsResponse,
  ScenarioTestResultEvent,
  ServiceConfig,
  TestConfig,
  WorkflowLogEvent,
  WorkflowRunInput,
} from "../workflow/types/react-flow-cots";

export const inngest = new Inngest({
  id: "cots-orchestrator",
  name: "COTS Container Orchestrator",
  middleware: [realtimeMiddleware()],
});

export type Events = {
  "cots/workflow.run.start": {
    data: WorkflowRunInput;
  };
  "cots/workflow.run.log": {
    data: WorkflowLogEvent;
  };
  "cots/workflow.run.result": {
    data: {
      workflowRunId: string;
      success: boolean;
    };
  };
  "cots/scenario.services.provision": {
    data: {
      workflowRunId: string;
      scenarioId: string;
      services: ServiceConfig[];
    };
  };
  "cots/scenario.services.created": {
    data: {
      workflowRunId: string;
      scenarioId: string;
      backendSessionId: string;
    };
  };
  "cots/scenario.tests.execute": {
    data: {
      workflowRunId: string;
      scenarioId: string;
      backendSessionId: string;
      tests: TestConfig[];
    };
  };
  "cots/scenario.tests.completed": {
    data: {
      workflowRunId: string;
      scenarioId: string;
      backendSessionId: string;
      results: RunTestsResponse;
    };
  };
  "cots/scenario.cleanup.execute": {
    data: {
      workflowRunId: string;
      scenarioId: string;
      backendSessionId: string;
    };
  };
  "cots/scenario.test-results": {
    data: ScenarioTestResultEvent;
  };
};
