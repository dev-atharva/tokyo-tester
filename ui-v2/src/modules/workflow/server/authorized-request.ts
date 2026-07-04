export function bindWorkflowRequestToIdentity(
  body: Record<string, unknown>,
  userId: string,
  projectId: string,
): Record<string, unknown> {
  return {
    ...body,
    projectId,
    userId,
    scenarios: Array.isArray(body.scenarios)
      ? body.scenarios.map((scenario) =>
          scenario && typeof scenario === "object"
            ? { ...scenario, user_id: userId, projectId }
            : scenario,
        )
      : body.scenarios,
  };
}

export function bindSyncBatchToIdentity(
  body: Record<string, unknown>,
  userId: string,
  projectId: string,
): Record<string, unknown> {
  return {
    ...body,
    user_id: userId,
    project_id: projectId,
    changes: Array.isArray(body.changes)
      ? body.changes.map((change) => {
          if (!change || typeof change !== "object") return change;
          const record = change as Record<string, unknown>;
          const data = record.data;
          return {
            ...record,
            data:
              data && typeof data === "object" && !Array.isArray(data)
                ? { ...data, user_id: userId, project_id: projectId }
                : data,
          };
        })
      : body.changes,
  };
}
