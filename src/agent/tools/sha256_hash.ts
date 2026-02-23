import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import crypto from "crypto";

interface HashDetails {
  algorithm: string;
  inputLength: number;
}

export function createSha256Tool(): AgentTool<any, HashDetails> {
  return {
    name: "sha256_hash",
    label: "SHA-256 Hash Calculator",
    description: "计算输入字符串的 SHA-256 哈希值并返回十六进制字符串",
    parameters: Type.Object({
      text: Type.String({ description: "需要计算哈希的输入字符串" }),
    }),
    execute: async (_toolCallId, params) => {
      const hash = crypto.createHash("sha256");
      hash.update(params.text);
      const hexHash = hash.digest("hex");
      
      return {
        content: [{ type: "text", text: hexHash }],
        details: {
          algorithm: "SHA-256",
          inputLength: params.text.length,
        },
      };
    },
  };
}