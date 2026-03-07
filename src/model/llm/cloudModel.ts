import type { LLMMessage } from "../../types/message";
import type { CloudModel, CloudModelCompleteInput, CloudModelCompleteOutput } from "./types";

export interface CreateOpenAICloudModelOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_MODEL = "deepseek-chat";
const MAX_RETRIES = 5;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
}

export function createOpenAICloudModel(
  options: CreateOpenAICloudModelOptions = {}
): CloudModel {
  const apiKey = options.apiKey ?? process.env.API_KEY;
  const baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = options.model ?? DEFAULT_MODEL;

  return {
    async complete(input: CloudModelCompleteInput): Promise<CloudModelCompleteOutput> {
      if (!apiKey) {
        throw new Error("API_KEY or options.apiKey is required for cloud model.");
      }

      const messages = input.messages.map(toChatMessage);
      let lastError: unknown = null;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
        try {
          const response = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              stream: false,
            }),
          });

          if (!response.ok) {
            const reason = await response.text().catch(() => "");
            throw new Error(`Cloud model request failed (${response.status}): ${reason}`);
          }

          const data = (await response.json()) as ChatCompletionResponse;
          const content = data.choices?.[0]?.message?.content;
          const text = typeof content === "string" ? content : "";
          return { text };
        } catch (error) {
          lastError = error;
          const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
          await sleep(3000);
          if (attempt >= MAX_RETRIES) {
            break;
          }
        }
      }

      throw lastError instanceof Error
        ? lastError
        : new Error("Cloud model request failed after retries.");
    },
  };
}

function toChatMessage(message: LLMMessage): { role: "user" | "assistant" | "system"; content: string } {
  return {
    role: message.role,
    content: message.content,
  };
}
