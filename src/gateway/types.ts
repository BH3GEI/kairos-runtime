import type { AgentRuntime } from "../agent";
import type { TelegramAdapter, TelegramMessage } from "../telegram/types";

export interface GatewayContext {
  telegram: TelegramAdapter;
  runtime: AgentRuntime;
}

export type TriggerReason = "mention_me" | "reply_to_me" | "none";

export interface TriggerDecision {
  shouldTrigger: boolean;
  reason: TriggerReason;
  prompt?: string;
}

export interface GatewayTriggerPolicy {
  name: string;
  priority: number;
  decide: (
    message: TelegramMessage,
    context: GatewayContext
  ) => Promise<TriggerDecision> | TriggerDecision;
}
