import type { LLMMessage } from "../../agent/core/openai";
import type { TelegramMessage } from "../../telegram/types";

export interface MessageNode {
  message: TelegramMessage;
  messageId: number;
  timestamp: number;
  replyToId: number | null;
  childrenIds: number[];
  sessionId: string;
  vector: number[];
}

export interface SessionControlBlock {
  sessionId: string;
  topicSummary: string;
  centerVector: number[];
  recentVector: number[] | null;
  status: "L1_ACTIVE" | "L2_BACKGROUND";
  lastActiveTime: number;
  messageIds: Set<number>;
  rootMessageIds: Set<number>;
}

export interface ChatControlBlock {
  chatId: number;
  sessionControlBlocks: Map<string, SessionControlBlock>;
  messageNodes: Map<number, MessageNode>;
  lastMessageNodeId: number | null;
  nextSessionSeq: number;
}

export interface ContextStore {
  ingestMessage: (input: { message: TelegramMessage }) => Promise<void>;
  getContextByAnchor: (input: { chatId: number; messageId: number }) => TelegramMessage[];
  debugPrintSessionControlBlocks: (input?: {
    chatId?: number;
    includeVectors?: boolean;
    log?: (...args: unknown[]) => void;
  }) => void;
}

export interface ContextAssemblerBuildInput {
  triggerMessage: TelegramMessage;
  prompt: string;
  systemPrompt: string;
  contextMessages: TelegramMessage[];
}

export interface ContextAssembler {
  build: (input: ContextAssemblerBuildInput) => LLMMessage[];
}
