import { WorkflowRunPage } from "@/modules/workflow/components/WorkflowRunPage";

export const metadata = {
  title: "Workflow run | Tokyo Tester",
};

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; workflowRunId: string }>;
  searchParams: Promise<{ projectId?: string }>;
}) {
  const [{ id, workflowRunId }, { projectId }] = await Promise.all([
    params,
    searchParams,
  ]);
  return (
    <WorkflowRunPage
      workflowId={id}
      workflowRunId={workflowRunId}
      requestedProjectId={projectId}
    />
  );
}
