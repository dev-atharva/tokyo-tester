import { describe, expect, test } from "bun:test";
import {
  bindSyncBatchToIdentity,
  bindWorkflowRequestToIdentity,
} from "./authorized-request";

describe("authorized workflow request", () => {
  test("replaces untrusted workflow and scenario identity fields", () => {
    const request = bindWorkflowRequestToIdentity(
      {
        projectId: "attacker-project",
        userId: "attacker",
        scenarios: [
          { id: "one", projectId: "other-project", user_id: "attacker" },
        ],
      },
      "authenticated-user",
      "authorized-project",
    );

    expect(request.projectId).toBe("authorized-project");
    expect(request.userId).toBe("authenticated-user");
    expect(request.scenarios).toEqual([
      {
        id: "one",
        projectId: "authorized-project",
        user_id: "authenticated-user",
      },
    ]);
  });

  test("replaces untrusted sync envelope and entity ownership", () => {
    const request = bindSyncBatchToIdentity(
      {
        project_id: "attacker-project",
        user_id: "attacker",
        changes: [
          {
            entity_type: "workflow",
            data: { project_id: "other", user_id: "attacker", name: "Safe" },
          },
        ],
      },
      "authenticated-user",
      "authorized-project",
    );
    expect(request).toMatchObject({
      project_id: "authorized-project",
      user_id: "authenticated-user",
      changes: [
        {
          data: {
            project_id: "authorized-project",
            user_id: "authenticated-user",
            name: "Safe",
          },
        },
      ],
    });
  });
});
