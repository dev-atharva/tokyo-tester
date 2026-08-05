import { RunIntentHandoffPage } from "@/modules/workflow/components/RunIntentHandoffPage";

export default async function RunIntentPage({
  params,
}: {
  params: Promise<{ runIntentId: string }>;
}) {
  const { runIntentId } = await params;
  return <RunIntentHandoffPage runIntentId={runIntentId} />;
}
