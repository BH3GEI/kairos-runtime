import type { GatewayTriggerPolicy } from "../types";

export function createMentionMeTriggerPolicy(): GatewayTriggerPolicy {
  return {
    name: "MentionMe",
    priority: 20,
    decide: (message) => {
      if (!message.metadata.isMentionMe) {
        return { shouldTrigger: false, reason: "none" };
      }
      const prompt = message.context.trim();
      if (!prompt) {
        return { shouldTrigger: false, reason: "none" };
      }
      return { shouldTrigger: true, reason: "mention_me", prompt };
    },
  };
}
