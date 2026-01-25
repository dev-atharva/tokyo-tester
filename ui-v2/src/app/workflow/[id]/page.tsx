import { FlowBuilder } from "@/modules/workflow/components/FlowBuilder/index";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <>
        <FlowBuilder workflowId={id} />
      </>
    </>
  );
}
