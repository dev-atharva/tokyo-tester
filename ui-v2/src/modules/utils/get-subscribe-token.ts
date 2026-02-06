"use server";

import { inngest } from "../inngest/client";

import {
  logsChannel,
  testResultChannel,
} from "../inngest/function/cots-workflow";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";

export type LogsChannelToken = Realtime.Token<
  typeof logsChannel,
  ["workflowlog"]
>;

export type TestResultChannelToken = Realtime.Token<
  typeof testResultChannel,
  ["testresult"]
>;

export async function fetchLogsRealtimeSubscriptionToken(): Promise<LogsChannelToken> {
  // const { userId } = await getSession();

  // This creates a token using the Inngest API that is bound to the channel and topic:
  const token = await getSubscriptionToken(inngest, {
    channel: logsChannel(),
    topics: ["workflowlog"],
  });

  return token;
}

export async function fetchTestResultRealtimeSubscriptionToken(): Promise<TestResultChannelToken> {
  // const { userId } = await getSession();

  // This creates a token using the Inngest API that is bound to the channel and topic:
  const token = await getSubscriptionToken(inngest, {
    channel: testResultChannel(),
    topics: ["testresult"],
  });

  return token;
}
