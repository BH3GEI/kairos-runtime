import type { LLMMessage, OpenAIAgent } from "./openai";
import type { TelegramMessage } from "../../telegram/types";
import { system } from "../prompt";
import { RemoteAsyncIterable } from "../remoteAsyncIterable";
import type { AgentEnclaveClient } from "../transport/enclave/protocol";
import { createLocalEnclaveClient } from "../transport/enclave/client";

export interface AgentRuntime {
  observe: (message: TelegramMessage) => void;
  streamReply: (input: {
    triggerMessage: TelegramMessage;
    prompt: string;
  }) => AsyncIterable<string>;
}

export interface CreateInMemoryAgentRuntimeOptions {
  agent?: OpenAIAgent;
  enclaveClient?: AgentEnclaveClient;
  maxHistoryPerChat?: number;
}

export function createInMemoryAgentRuntime(
  options: CreateInMemoryAgentRuntimeOptions
): AgentRuntime {
  const enclaveClient =
    options.enclaveClient ?? (options.agent ? createLocalEnclaveClient(options.agent) : null);
  if (!enclaveClient) {
    throw new Error("createInMemoryAgentRuntime requires either agent or enclaveClient.");
  }

  const maxHistoryPerChat = options.maxHistoryPerChat ?? 50;
  const historyByChat = new Map<number, TelegramMessage[]>();

  const observe: AgentRuntime["observe"] = (message) => {
    const history = historyByChat.get(message.chatId) ?? [];
    history.push(message);
    if (history.length > maxHistoryPerChat) {
      history.splice(0, history.length - maxHistoryPerChat);
    }
    historyByChat.set(message.chatId, history);
  };

  const streamReply: AgentRuntime["streamReply"] = ({
    triggerMessage,
    prompt,
  }) => {
    const stream = new RemoteAsyncIterable<string>();
    const history = historyByChat.get(triggerMessage.chatId) ?? [];
    const systemPrompt = system();
    const llmMessages = buildLLMMessages(history, triggerMessage.messageId, prompt, systemPrompt);
    void (async () => {
      try {
        for await (const event of enclaveClient.streamReply({
          chatId: triggerMessage.chatId,
          messages: llmMessages,
        })) {
          if (
            event.type === "message_update" &&
            event.role === "assistant" &&
            event.delta
          ) {
            stream.push(event.delta);
            continue;
          }
          if (event.type === "failed") {
            throw new Error(event.error);
          }
          if (event.type === "completed") {
            break;
          }
        }
        stream.end();
      } catch (error) {
        stream.fail(error);
      }
    })();
    return stream;
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
