"use server";

import { inngest } from "../inngest/client";

import { logsChannel } from "../inngest/function/cots-workflow";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";

export type LogsChannelToken = Realtime.Token<
  typeof logsChannel,
  ["workflowlog"]
>;

export async function fetchRealtimeSubscriptionToken(): Promise<LogsChannelToken> {
  // const { userId } = await getSession();

  // This creates a token using the Inngest API that is bound to the channel and topic:
  const token = await getSubscriptionToken(inngest, {
    channel: logsChannel(),
    topics: ["workflowlog"],
  });

  return token;
}
