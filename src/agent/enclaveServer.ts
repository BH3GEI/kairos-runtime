import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LLMMessage } from "./openai";
import { createOpenAIEnclaveRuntime } from "./openai";
import type { AgentLoopStreamEvent } from "./loopRunner";
import {
  createFetchWebpageTool,
  createListFilesSafeTool,
  createReadFileSafeTool,
  createRunSafeBashTool,
  createWriteFileSafeTool,
} from "./tools";

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROTO_PATH = resolve(CURRENT_DIR, "proto/enclave.proto");
const DEFAULT_BIND_ADDR = process.env.AGENT_ENCLAVE_BIND_ADDR ?? "0.0.0.0:50051";

const API_KEY = process.env.API_KEY ?? process.env.QWEN_API_KEY;
const baseURL = process.env.BASE_URL ?? "https://coding.dashscope.aliyuncs.com/v1";
const model = process.env.MODEL ?? "qwen3-coder-next";

if (!API_KEY) {
  throw new Error("API_KEY (or QWEN_API_KEY) is required to start enclave server.");
}

const toolFactories: Record<string, () => any> = {
  fetch_webpage: createFetchWebpageTool,
  run_safe_bash: createRunSafeBashTool,
  read_file_safe: createReadFileSafeTool,
  write_file_safe: createWriteFileSafeTool,
  list_files_safe: createListFilesSafeTool,
};

function parseEnabledToolNames(): Set<string> {
  const raw = process.env.ENABLED_TOOLS?.trim();
  if (!raw || raw.toLowerCase() === "all") {
    return new Set(Object.keys(toolFactories));
  }
  const names = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return new Set(names);
}

function buildEnabledTools(enabledToolNames: Set<string>) {
  return Array.from(enabledToolNames)
    .map((name) => {
      const factory = toolFactories[name];
      if (!factory) {
        console.warn(`[enclave] unknown tool skipped: ${name}`);
        return null;
      }
      return factory();
    })
    .filter((tool): tool is NonNullable<typeof tool> => Boolean(tool));
}

interface GrpcStreamReplyRequest {
  chat_id?: string;
  messages?: Array<{ role?: string; content?: string }>;
}

interface GrpcStreamReplyEvent {
  type: string;
  role?: string;
  delta?: string;
  tool_name?: string;
  tool_call_id?: string;
  result_json?: string;
  error?: string;
}

const enabledToolNames = parseEnabledToolNames();
const enclaveRuntime = createOpenAIEnclaveRuntime({
  apiKey: API_KEY,
  model,
  baseURL,
  tools: buildEnabledTools(enabledToolNames),
});

const packageDefinition = protoLoader.loadSync(DEFAULT_PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const loaded = grpc.loadPackageDefinition(packageDefinition) as {
  memoh_lite?: {
    enclave?: {
      v1?: {
        AgentEnclaveService?: {
          service: grpc.ServiceDefinition;
        };
      };
    };
  };
};

const service = loaded.memoh_lite?.enclave?.v1?.AgentEnclaveService?.service;
if (!service) {
  throw new Error("Failed to resolve AgentEnclaveService from proto.");
}

function sanitizeMessages(input: GrpcStreamReplyRequest["messages"]): LLMMessage[] {
  if (!Array.isArray(input)) {
    return [];
  }
  return input
    .map((item) => {
      const role: LLMMessage["role"] =
        item.role === "system" || item.role === "assistant" || item.role === "user"
          ? item.role
          : "user";
      return {
        role,
        content: typeof item.content === "string" ? item.content : "",
      };
    })
    .filter((item) => item.content.trim().length > 0);
}

function toGrpcEvent(event: AgentLoopStreamEvent): GrpcStreamReplyEvent {
  if (!event || typeof event !== "object" || !("type" in event)) {
    return { type: "failed", error: "Invalid enclave event payload." };
  }
  if (event.type === "message_update") {
    return {
      type: "message_update",
      role: "assistant",
      delta: event.delta,
    };
  }
  if (event.type === "tool_execution_start") {
    return {
      type: "tool_execution_start",
      tool_name: event.toolName,
      tool_call_id: event.toolCallId,
    };
  }
  if (event.type === "tool_execution_end") {
    return {
      type: "tool_execution_end",
      tool_name: event.toolName,
      tool_call_id: event.toolCallId,
      result_json: event.result === undefined ? "" : JSON.stringify(event.result),
    };
  }
  if (event.type === "failed") {
    return { type: "failed", error: event.error };
  }
  return { type: "completed" };
}

const originalFetch = global.fetch;

global.fetch = (async (...args) => {
  const [url, config] = args;
  
  // 试着解析请求的 body，看看是不是发给 LLM 的 Payload
  if (config && typeof config.body === 'string') {
    try {
      const payload = JSON.parse(config.body);
      
      if (payload.messages) {
        console.log(`\n\n[🕵️ Network Intercept] 发送请求到: ${url}`);
        console.log("payload:", payload);
        // 重点关注！打印出当前发送出去的所有工具名称
        if (payload.tools) {
          const toolNames = payload.tools.map((t: any) => 
            t.function?.name || t.name || 'unknown'
          );
          console.log(`[🕵️ Network Intercept] 携带的 Tool Schema 列表:`, toolNames);
        } else {
          console.log(`[🕵️ Network Intercept] ⚠️ 本次请求没有携带任何工具！`);
        }
      }
    } catch (e) {
      // 解析失败就不管了，说明不是 JSON payload
    }
  }

  // 放行原请求
  return originalFetch(...args);
}) as typeof global.fetch;


const server = new grpc.Server();
server.addService(service, {
  StreamReply: async (
    call: grpc.ServerWritableStream<GrpcStreamReplyRequest, GrpcStreamReplyEvent>
  ) => {
    try {
      const request = call.request;
      const messages = sanitizeMessages(request.messages);
      for await (const event of enclaveRuntime.streamEvents(messages)) {
        call.write(toGrpcEvent(event));
      }
      call.end();
    } catch (error) {
      call.write({
        type: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
      call.end();
    }
  },
});

server.bindAsync(
  DEFAULT_BIND_ADDR,
  grpc.ServerCredentials.createInsecure(),
  (error) => {
    if (error) {
      console.error("[enclave] failed to bind grpc server:", error);
      process.exit(1);
    }
    server.start();
    console.log(`[enclave] grpc server listening on ${DEFAULT_BIND_ADDR}`);
  }
);

process.on("SIGINT", () => {
  server.tryShutdown(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.tryShutdown(() => process.exit(0));
});
