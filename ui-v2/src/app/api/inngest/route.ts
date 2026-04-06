import { serve } from "inngest/next";
import { inngest } from "@/modules/inngest/client";
import { cotsWorkFlow } from "@/modules/inngest/workflow-run/cots-workflow";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [cotsWorkFlow],
});
