/**
 * Logos 5 primitives as AgentTools.
 * Replaces readFileSafe, writeFileSafe, runSafeBash, listFilesSafe.
 * All operations go through logos kernel gRPC — no direct host access.
 */

import { z } from "zod";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { createChannel, createClient, Metadata } from "nice-grpc";
import * as grpc from "@grpc/grpc-js";
import { LogosDefinition, type LogosClient } from "../../../state-daemon/storage/vfs/generated/logos";

const SOCKET = process.env.LOGOS_SOCKET ?? "/tmp/logos-sandbox/logos.sock";
const MAX_MSG = 16 * 1024 * 1024;

let _client: LogosClient | null = null;
let _sessionKey: string | undefined;

function getClient(): LogosClient {
  if (!_client) {
    const target = SOCKET.startsWith("unix:") ? SOCKET : `unix://${SOCKET}`;
    const channel = createChannel(target, grpc.credentials.createInsecure(), {
      "grpc.max_send_message_length": MAX_MSG,
      "grpc.max_receive_message_length": MAX_MSG,
    });
    _client = createClient(LogosDefinition, channel);
  }
  return _client;
}

function meta(): { metadata: Metadata } | undefined {
  if (!_sessionKey) return undefined;
  const m = new Metadata();
  m.set("x-logos-session", _sessionKey);
  return { metadata: m };
}

/** Initialize logos connection: register token + handshake. Call once at startup. */
export async function initLogosSession(taskId: string, agentConfigId: string): Promise<void> {
  const client = getClient();
  const token = crypto.randomUUID();
  await client.registerToken({ token, taskId, role: "admin", agentConfigId });
  const resp = await client.handshake({ token }, {
    onHeader: (header: Metadata) => {
      _sessionKey = header.get("x-logos-session")?.toString();
    },
  });
  if (!resp.ok) throw new Error(`logos handshake failed: ${resp.error}`);
}

// --- Tool: logos_read ---

export const logosReadTool: AgentTool<typeof logosReadSchema> = {
  name: "logos_read",
  description: "Read from any logos:// URI or relative path (auto-scoped to your sandbox).",
  parameters: logosReadSchema,
  execute: async ({ uri }) => {
    const client = getClient();
    const resp = await client.read({ uri }, meta());
    return resp.content;
  },
};
const logosReadSchema = z.object({
  uri: z.string().describe("logos:// URI or relative path"),
});

// --- Tool: logos_write ---

export const logosWriteTool: AgentTool<typeof logosWriteSchema> = {
  name: "logos_write",
  description: "Write to any logos:// URI or relative path.",
  parameters: logosWriteSchema,
  execute: async ({ uri, content }) => {
    const client = getClient();
    await client.write({ uri, content }, meta());
    return "ok";
  },
};
const logosWriteSchema = z.object({
  uri: z.string().describe("logos:// URI or relative path"),
  content: z.string().describe("Content to write"),
});

// --- Tool: logos_exec ---

export const logosExecTool: AgentTool<typeof logosExecSchema> = {
  name: "logos_exec",
  description: "Run a shell command in the sandbox container.",
  parameters: logosExecSchema,
  execute: async ({ command }) => {
    const client = getClient();
    const resp = await client.exec({ command }, meta());
    let out = "";
    if (resp.stdout) out += resp.stdout;
    if (resp.stderr) out += (out ? "\n" : "") + resp.stderr;
    if (resp.exitCode !== 0) out += `\n[exit code: ${resp.exitCode}]`;
    return out || "(no output)";
  },
};
const logosExecSchema = z.object({
  command: z.string().describe("Shell command to execute"),
});

// --- Tool: logos_call ---

export const logosCallTool: AgentTool<typeof logosCallSchema> = {
  name: "logos_call",
  description: "Call a logos proc tool (system.complete, system.search_tasks, memory.search, etc.).",
  parameters: logosCallSchema,
  execute: async ({ tool, params }) => {
    const client = getClient();
    const resp = await client.call(
      { tool, paramsJson: JSON.stringify(params) },
      meta()
    );
    return resp.resultJson;
  },
};
const logosCallSchema = z.object({
  tool: z.string().describe("Tool name"),
  params: z.record(z.unknown()).describe("Tool parameters"),
});

// --- Tool: logos_patch ---

export const logosPatchTool: AgentTool<typeof logosPatchSchema> = {
  name: "logos_patch",
  description: "JSON deep merge at any logos:// URI.",
  parameters: logosPatchSchema,
  execute: async ({ uri, partial }) => {
    const client = getClient();
    await client.patch({ uri, partial }, meta());
    return "ok";
  },
};
const logosPatchSchema = z.object({
  uri: z.string().describe("logos:// URI"),
  partial: z.string().describe("JSON to merge"),
});

/** All logos primitive tools */
export const logosPrimitiveTools = [
  logosReadTool,
  logosWriteTool,
  logosExecTool,
  logosCallTool,
  logosPatchTool,
];
