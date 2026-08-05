import { describe, expect, test } from "bun:test";
import type { WorkflowRunInput } from "../types/react-flow-cots";
import {
  authorizeWorkflowRun,
  browserJourneyArtifactUrl,
  cancelWorkflowRun,
  fetchWorkflowRunEventsSince,
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
  test("builds an authorized same-origin artifact URL", () => {
    expect(browserJourneyArtifactUrl("run/1", "shot one", "project 1")).toBe(
      "/api/v1/workflow-runs/run%2F1/artifacts/shot%20one?projectId=project+1",
    );
  });

  test("authorizes a run through the human-only endpoint", async () => {
    let body: unknown;
    await authorizeWorkflowRun(
      input,
      [{ secretRef: "PASSWORD", value: "sentinel" }],
      async (request, init) => {
        expect(String(request)).toBe("/api/v1/workflow-runs/authorize");
        body = JSON.parse(String(init?.body));
        return Response.json(
          { workflowRunId: "run-1", status: "pending", created: true },
          { status: 202 },
        );
      },
    );
    expect(body).toEqual({
      request: input,
      runSecrets: [{ secretRef: "PASSWORD", value: "sentinel" }],
    });
  });

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

  test("does not treat an unexpected successful status as accepted", async () => {
    expect(
      submitWorkflowRun(input, async () => Response.json({}, { status: 200 })),
    ).rejects.toThrow("was not accepted");
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

  test("replays every durable workflow event after a cursor across pages", async () => {
    const requested: string[] = [];
    const storedEvent = (id: number) => ({
      id,
      workflow_run_id: "run-1",
      event_type: "workflowlog" as const,
      payload: JSON.stringify({
        workflowRunId: "run-1",
        projectId: "project-1",
        workflowId: "workflow-1",
        message: `event-${id}`,
        timestamp: id,
        sequence: id,
      }),
      created_at: new Date(id).toISOString(),
    });

    const replay = await fetchWorkflowRunEventsSince(
      "run-1",
      "project-1",
      40,
      2,
      async (input) => {
        requested.push(String(input));
        if (requested.length === 1) {
          return Response.json({
            events: [storedEvent(44), storedEvent(43)],
            hasMore: true,
            nextBefore: 43,
          });
        }
        return Response.json({
          events: [storedEvent(42), storedEvent(40)],
          hasMore: true,
          nextBefore: 40,
        });
      },
    );

    expect(requested).toHaveLength(2);
    expect(requested[1]).toContain("before=43");
    expect(replay.events.map((item) => item.id)).toEqual([42, 43, 44]);
    expect(replay.newestEventId).toBe(44);
  });

  test("stops durable replay if the runner repeats a pagination cursor", async () => {
    let requests = 0;
    await expect(
      fetchWorkflowRunEventsSince("run-1", "project-1", 0, 2, async () => {
        requests += 1;
        return Response.json({
          events: [],
          hasMore: true,
          nextBefore: 9,
        });
      }),
    ).rejects.toThrow("repeated pagination cursor");
    expect(requests).toBe(2);
  });
});
