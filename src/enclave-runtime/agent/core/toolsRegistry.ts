import type { AgentTool } from "@mariozechner/pi-agent-core";

export interface ToolsRegistry {
  getVersion: () => number;
  getCurrentTools: () => AgentTool<any>[];
  registerStaticTool: (tool: AgentTool<any>) => number;
  registerDynamicTool: (tool: AgentTool<any>) => number;
  unregisterTool: (name: string) => boolean;
  replaceStaticTools: (tools: AgentTool<any>[]) => number;
}

export function createToolsRegistry(initialStaticTools: AgentTool<any>[] = []): ToolsRegistry {
  const staticToolRegistry = new Map<string, AgentTool<any>>(
    initialStaticTools.map((tool) => [tool.name, tool])
  );
  const dynamicToolRegistry = new Map<string, AgentTool<any>>();
  let version = 1;

  const bumpVersion = () => {
    version += 1;
    return version;
  };

  const getCurrentTools = () => {
    const merged = new Map<string, AgentTool<any>>(staticToolRegistry);
    for (const [name, tool] of dynamicToolRegistry) {
      merged.set(name, tool);
    }
    return Array.from(merged.values());
  };

  const registerStaticTool = (tool: AgentTool<any>) => {
    staticToolRegistry.set(tool.name, tool);
    return bumpVersion();
  };

  const registerDynamicTool = (tool: AgentTool<any>) => {
    dynamicToolRegistry.set(tool.name, tool);
    return bumpVersion();
  };

  const unregisterTool = (name: string) => {
    const deletedDynamic = dynamicToolRegistry.delete(name);
    const deletedStatic = staticToolRegistry.delete(name);
    const deleted = deletedDynamic || deletedStatic;
    if (deleted) {
      bumpVersion();
    }
    return deleted;
  };

  const replaceStaticTools = (tools: AgentTool<any>[]) => {
    staticToolRegistry.clear();
    for (const tool of tools) {
      staticToolRegistry.set(tool.name, tool);
    }
    return bumpVersion();
  };

  return {
    getVersion: () => version,
    getCurrentTools,
    registerStaticTool,
    registerDynamicTool,
    unregisterTool,
    replaceStaticTools,
  };
}
