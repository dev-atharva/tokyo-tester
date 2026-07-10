import { describe, expect, test } from "bun:test";
import type { WorkflowRunInput } from "../types/react-flow-cots";
import { fetchWorkflowRunSnapshot, submitWorkflowRun } from "./runner-client";

const input = {
  workflowRunId: "run-1",
  projectId: "project-1",
  workflowId: "workflow-1",
  workflowName: "Workflow",
  nodes: [],
  edges: [],
  scenarios: [],
} satisfies WorkflowRunInput;

describe("runner client", () => {
  test("submits the workflow to the same-origin runner proxy", async () => {
    let url = "";
    let init: RequestInit | undefined;
    await submitWorkflowRun(input, async (request, requestInit) => {
      url = request.toString();
      init = requestInit;
      return new Response(null, { status: 202 });
    });

    expect(url).toBe("/api/v1/workflow-runs");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body)).workflowRunId).toBe("run-1");
  });

  test("surfaces the runner JSON error message", async () => {
    expect(
      submitWorkflowRun(input, async () =>
        Response.json(
          { error: "workflow must be synchronized" },
          { status: 400 },
        ),
      ),
    ).rejects.toThrow("workflow must be synchronized");
  });

  test("fetches a workflow run snapshot through the same-origin runner proxy", async () => {
    let url = "";
    await fetchWorkflowRunSnapshot("run/1", "project 1", async (request) => {
      url = request.toString();
      return Response.json({
        workflowRun: { id: "run/1" },
        scenarioRuns: [],
        testResults: [],
      });
    });

    expect(url).toBe("/api/v1/workflow-runs/run%2F1?projectId=project+1");
  });
});
