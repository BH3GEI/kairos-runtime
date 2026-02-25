import { Type } from "@mariozechner/pi-ai";

interface McpClientConfig {
  url: string;
  headers?: Record<string, string>;
  timeout?: number;
}

interface McpTool {
  name: string;
  description?: string;
  parameters?: any;
}

interface McpInvokeResult {
  content?: Array<{ type: string; text?: string; json?: any }>;
  error?: string;
}

export function createMcpClient(config: McpClientConfig) {
  const url = config.url;
  const headers = config.headers || {};
  const timeout = config.timeout || 5;

  const fetchWrapper = async (path: string, options: RequestInit = {}) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout * 1000);

    try {
      const res = await fetch(url + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json, application/mcp+json",
          ...headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!res.ok) {
        throw new Error("HTTP " + res.status + ": " + res.statusText);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/mcp+json")) {
        const clone = res.clone();
        const json = await clone.json();
        return json;
      } else {
        return await res.json();
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        return { error: "Request timed out after " + timeout + "s" };
      }
      return { error: err.message };
    }
  };

  async function discoverTools(): Promise<{ tools: McpTool[]; raw?: any }> {
    const paths = ["/tools", "/toolDefinitions", "/"];
    
    for (const path of paths) {
      const res = await fetchWrapper(path);
      if (res && !("error" in res)) {
        if (Array.isArray(res)) {
          return { tools: res };
        }
        if (res.tools && Array.isArray(res.tools)) {
          return { tools: res.tools };
        }
        if (res.toolDefinitions && Array.isArray(res.toolDefinitions)) {
          return { tools: res.toolDefinitions };
        }
      }
    }

    return { tools: [], raw: null };
  }

  async function invokeTool(toolName: string, params: Record<string, any>): Promise<McpInvokeResult> {
    const res = await fetchWrapper("/toolCalls", {
      method: "POST",
      body: JSON.stringify({
        toolName,
        arguments: params,
        id: "req-" + Date.now(),
      }),
    });

    if ("error" in res) return { error: res.error };

    if (Array.isArray(res && res.content)) {
      return { content: res.content };
    }

    return res as McpInvokeResult;
  }

  return {
    discoverTools,
    invokeTool,
  };
}

export default createMcpClient();
