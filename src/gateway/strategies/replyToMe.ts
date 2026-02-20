import type { GatewayTriggerPolicy } from "../types";

export function createReplyToMeTriggerPolicy(): GatewayTriggerPolicy {
  return {
    name: "ReplyToMe",
    priority: 10,
    decide: (message) => {
      if (!message.metadata.isReplyToMe) {
        return { shouldTrigger: false, reason: "none" };
      }
      const prompt = message.context.trim();
      if (!prompt) {
        return { shouldTrigger: false, reason: "none" };
      }
      return { shouldTrigger: true, reason: "reply_to_me", prompt };
    },
  };
}
