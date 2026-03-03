import type { LLMMessage } from "../../agent/core/openai";
import type { ContextAssembler } from "./types";

export function createContextAssembler(): ContextAssembler {
  return {
    build: ({ contextMessages, triggerMessage, prompt, systemPrompt }) => {
      const history: LLMMessage[] = contextMessages
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((item) => {
          const baseContent = item.metadata.isBot ? `I: ${item.context}` : `User(${item.metadata.username}): ${item.context}`;
          const content = item.metadata.isMentionMe ? `${baseContent} (mentioned by ${triggerMessage.metadata.username})` : baseContent;
          return {
            role: "user",
            content,
          } as LLMMessage;
        })
        .filter((item) => item.content.trim().length > 0);

      return [{ role: "system", content: systemPrompt }, ...history];
    },
  };
}
