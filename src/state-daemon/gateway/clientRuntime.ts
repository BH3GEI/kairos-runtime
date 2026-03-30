/**
 * ClientRuntime — logos-native version.
 *
 * Messages go to logos kernel. Context comes from logos kernel.
 * Session clustering is done by kairos (decider), not logos default.
 * LLM loop runs in enclave, tools are logos 5 primitives.
 */

import type { TelegramMessage } from "../types/message";
import { RemoteAsyncIterable } from "../types/remoteAsyncIterable";
import type { AgentEnclaveClient } from "../enclave/protocol";
import { MemoryVfsClient } from "../storage/vfs/client";
import { system } from "./context/prompt";
import crypto from "node:crypto";

export interface ClientRuntime {
  recordMessage: (message: TelegramMessage) => Promise<void>;
  streamReply: (input: {
    triggerMessage: TelegramMessage;
    prompt: string;
  }) => AsyncIterable<string>;
}

export interface CreateClientRuntimeOptions {
  enclaveClient?: AgentEnclaveClient;
  vfsClient?: MemoryVfsClient;
}

export function createClientRuntime(options: CreateClientRuntimeOptions): ClientRuntime {
  const enclaveClient = options.enclaveClient;
  if (!enclaveClient) {
    throw new Error("createClientRuntime requires enclaveClient.");
  }

  const vfs = options.vfsClient ?? new MemoryVfsClient();

  const recordMessage: ClientRuntime["recordMessage"] = async (message) => {
    // Write message to logos memory — kernel handles session clustering
    try {
      await vfs.write({
        path: `logos://memory/groups/${message.chatId}/messages`,
        content: JSON.stringify({
          msg_id: message.messageId,
          chat_id: message.chatId,
          speaker: message.userId?.toString() ?? message.senderName ?? "unknown",
          text: message.text,
          reply_to: message.replyToMessageId ?? null,
          ts: new Date(message.timestamp * 1000).toISOString(),
          mentions: JSON.stringify(message.mentions ?? []),
        }),
      });
    } catch (error) {
      console.error(`[clientRuntime] failed to record message ${message.messageId}:`, error);
    }
  };

  const streamReply: ClientRuntime["streamReply"] = ({ triggerMessage, prompt }) => {
    const stream = new RemoteAsyncIterable<string>();
    const taskId = `tg-${triggerMessage.chatId}-${Date.now()}`;

    void (async () => {
      try {
        // 1. Register task + get context from logos
        const senderUid = triggerMessage.userId?.toString() ?? "unknown";
        let contextJson: any = {};
        try {
          const resp = await vfs.call({
            tool: "system.get_context",
            params: {
              chat_id: triggerMessage.chatId.toString(),
              sender_uid: senderUid,
              msg_id: triggerMessage.messageId,
            },
          });
          contextJson = typeof resp === "string" ? JSON.parse(resp) : resp;
        } catch (e) {
          console.error("[clientRuntime] get_context failed:", e);
        }

        // 2. Build LLM messages with logos context
        const systemPrompt = buildSystemPrompt(contextJson);
        const messages = buildLlmMessages(triggerMessage, prompt, contextJson);

        // 3. Stream reply from enclave
        for await (const event of enclaveClient.streamReply({
          chatId: triggerMessage.chatId,
          messages,
          imageUrls: triggerMessage.imageUrls,
        })) {
          if (event.type === "message_update" && event.role === "assistant" && event.delta) {
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

  return { recordMessage, streamReply };
}

function buildSystemPrompt(context: any): string {
  let prompt = system();

  // Inject session context if available
  if (context.session) {
    const msgs = context.session.messages ?? [];
    if (msgs.length > 0) {
      prompt += "\n\n## Current Session\n";
      for (const m of msgs.slice(-20)) {
        prompt += `[${m.speaker}]: ${m.text}\n`;
      }
    }
  }

  // Inject summary if available
  if (context.recent_summary && context.recent_summary !== "null") {
    const summary = typeof context.recent_summary === "string"
      ? context.recent_summary
      : JSON.stringify(context.recent_summary);
    prompt += `\n\n## Recent Summary\n${summary}`;
  }

  return prompt;
}

function buildLlmMessages(
  trigger: TelegramMessage,
  prompt: string,
  context: any,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [];

  // System prompt with context
  messages.push({ role: "system", content: buildSystemPrompt(context) });

  // Session messages as conversation history
  if (context.session?.messages) {
    for (const m of context.session.messages.slice(-10)) {
      const role = m.speaker === "assistant" ? "assistant" : "user";
      messages.push({ role, content: `[${m.speaker}]: ${m.text}` });
    }
  }

  // Current trigger message
  messages.push({ role: "user", content: prompt });

  return messages;
}
