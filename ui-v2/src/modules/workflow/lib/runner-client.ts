import type { WorkflowRunInput } from "../types/react-flow-cots";

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function submitWorkflowRun(
  input: WorkflowRunInput,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const response = await fetcher("/api/v1/workflow-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (response.ok) return;

  let message = `Runner returned ${response.status}`;
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) message = payload.error;
  } catch {
    const body = await response.text().catch(() => "");
    if (body) message = body;
  }
  throw new Error(message);
}
