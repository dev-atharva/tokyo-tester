import { describe, expect, test } from "bun:test";
import type { WorkflowRunInput } from "../types/react-flow-cots";
import {
  cancelWorkflowRun,
  fetchWorkflowRunLogs,
  fetchWorkflowRunSnapshot,
  submitWorkflowRun,
} from "./runner-client";

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

  test("returns durable queue metadata from an accepted submission", async () => {
    const submission = await submitWorkflowRun(input, async () =>
      Response.json(
        {
          workflowRunId: "run-1",
          status: "pending",
          created: true,
          queue: {
            status: "pending",
            position: 2,
            queuedAt: new Date(0).toISOString(),
            workerConcurrency: 2,
          },
        },
        { status: 202 },
      ),
    );

    expect(submission.queue?.position).toBe(2);
    expect(submission.queue?.workerConcurrency).toBe(2);
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

  test("requests durable cancellation through the authorized runner proxy", async () => {
    const requests: Array<{ input: RequestInfo | URL; init?: RequestInit }> =
      [];
    const result = await cancelWorkflowRun(
      "run/one",
      "project-1",
      async (input, init) => {
        requests.push({ input, init });
        return Response.json({
          workflowRunId: "run/one",
          status: "cancelling",
          changed: true,
        });
      },
    );
    expect(String(requests[0]?.input)).toBe(
      "/api/v1/workflow-runs/run%2Fone?projectId=project-1",
    );
    expect(requests[0]?.init?.method).toBe("DELETE");
    expect(result.status).toBe("cancelling");
  });

  test("loads cursor-paginated durable workflow logs", async () => {
    let requested = "";
    const page = await fetchWorkflowRunLogs(
      "run-1",
      "project-1",
      42,
      25,
      async (input) => {
        requested = String(input);
        return Response.json({
          events: [],
          hasMore: true,
          nextBefore: 17,
        });
      },
    );
    expect(requested).toBe(
      "/api/v1/workflow-runs/run-1/logs?projectId=project-1&limit=25&before=42",
    );
    expect(page.nextBefore).toBe(17);
  });
});
