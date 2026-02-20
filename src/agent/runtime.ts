import type { LLMMessage, OpenAIAgent } from "./openai";
import type { TelegramMessage } from "../telegram/types";

const DEFAULT_SYSTEM_PROMPT = "你是一个简洁、友好的中文助手。";

export interface AgentRuntime {
  observe: (message: TelegramMessage) => void;
  streamReply: (input: {
    triggerMessage: TelegramMessage;
    prompt: string;
  }) => AsyncGenerator<string, void, unknown>;
}

export interface CreateInMemoryAgentRuntimeOptions {
  agent: OpenAIAgent;
  maxHistoryPerChat?: number;
  systemPrompt?: string;
}

export function createInMemoryAgentRuntime(
  options: CreateInMemoryAgentRuntimeOptions
): AgentRuntime {
  const maxHistoryPerChat = options.maxHistoryPerChat ?? 50;
  const systemPrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;
  const historyByChat = new Map<number, TelegramMessage[]>();

  const observe: AgentRuntime["observe"] = (message) => {
    const history = historyByChat.get(message.chatId) ?? [];
    history.push(message);
    if (history.length > maxHistoryPerChat) {
      history.splice(0, history.length - maxHistoryPerChat);
    }
    historyByChat.set(message.chatId, history);
  };

  const streamReply: AgentRuntime["streamReply"] = async function* ({
    triggerMessage,
    prompt,
  }) {
    const history = historyByChat.get(triggerMessage.chatId) ?? [];
    const llmMessages = buildLLMMessages(history, triggerMessage.messageId, prompt, systemPrompt);
    yield* options.agent.streamText(llmMessages);
  };

  return {
    observe,
    streamReply,
  };
}

function buildLLMMessages(
  history: TelegramMessage[],
  triggerMessageId: number,
  prompt: string,
  systemPrompt: string
): LLMMessage[] {
  const userHistory: LLMMessage[] = history
    .filter((item) => !item.metadata.isBot)
    .map((item) => ({
      role: "user" as const,
      content:
        item.messageId === triggerMessageId ? prompt : item.context,
    }))
    .filter((item) => item.content.trim().length > 0);

  return [{ role: "system", content: systemPrompt }, ...userHistory];
}
