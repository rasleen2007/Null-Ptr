import type {
  AppSettings,
  ModelInfo,
  ToolDefinition,
  ToolInfo,
  ToolPermissionSettings,
} from "../types";
import type { ServerConfig } from "../config";
import { calculatorTool, currentTimeTool } from "./builtin/utility";
import { memoryTools } from "./builtin/memory";
import { fileTools } from "./builtin/files";
import { webFetchTool } from "./builtin/web";
import { shellCommandTool } from "./builtin/shell";
import { sarkariTools } from "./builtin/sarkari";

const PERMISSION_KEYS: Record<string, keyof ToolPermissionSettings | undefined> = {
  file_read: "allowFileRead",
  file_list: "allowFileRead",
  file_write: "allowFileWrite",
  memory_save: "allowMemoryWrite",
  memory_update: "allowMemoryWrite",
  web_fetch: "allowNetwork",
  shell_command: "allowShell",
  // The lookups are curated static indexes: no network and no user data leaves.
  // Drafts and forms write into the workspace, so they use the file-write gate.
  rti_draft: "allowFileWrite",
  form_fill: "allowFileWrite",
};

const MEMORY_TOOLS = new Set(["memory_save", "memory_update"]);

export interface ToolAvailability {
  enabled: boolean;
  reason?: string;
}

export function getToolAvailability(
  tool: Pick<ToolDefinition, "name" | "category">,
  settings: AppSettings,
  config: Pick<ServerConfig, "enableShell">,
): ToolAvailability {
  if (!settings.toolsEnabled) return { enabled: false, reason: "Tools are disabled in settings." };
  const permissionKey = PERMISSION_KEYS[tool.name];
  if (permissionKey && !settings.permissions[permissionKey]) {
    return { enabled: false, reason: `Permission "${permissionKey}" is turned off.` };
  }
  if (tool.name === "shell_command" && !config.enableShell) {
    return { enabled: false, reason: "Shell tool is disabled by SAATHI_ENABLE_SHELL." };
  }
  if (MEMORY_TOOLS.has(tool.name) && !settings.memoryEnabled) {
    return { enabled: false, reason: "Long-term memory is disabled in settings." };
  }
  return { enabled: true };
}

export function requiresApproval(tool: Pick<ToolDefinition, "sensitivity">): boolean {
  return tool.sensitivity === "sensitive";
}

export interface ToolRegistry {
  all: () => ToolDefinition[];
  get: (name: string) => ToolDefinition | undefined;
  infos: (settings: AppSettings) => ToolInfo[];
  availableForModel: (settings: AppSettings, model: ModelInfo) => ToolDefinition[];
}

export function createToolRegistry(config: Pick<ServerConfig, "enableShell">): ToolRegistry {
  const tools: ToolDefinition[] = [
    calculatorTool,
    currentTimeTool,
    ...memoryTools,
    ...fileTools,
    webFetchTool,
    shellCommandTool,
    ...sarkariTools,
  ];
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  return {
    all: () => tools,
    get: (name) => byName.get(name),
    infos: (settings) =>
      tools.map((tool) => {
        const availability = getToolAvailability(tool, settings, config);
        return {
          name: tool.name,
          description: tool.description,
          category: tool.category,
          sensitivity: tool.sensitivity,
          usesVault: tool.usesVault,
          parameters: tool.parameters,
          enabled: availability.enabled,
          disabledReason: availability.reason,
        };
      }),
    availableForModel: (settings, model) => {
      if (!settings.toolsEnabled || !model.supportsTools) return [];
      return tools.filter((tool) => getToolAvailability(tool, settings, config).enabled);
    },
  };
}

export type { ToolRegistry as ToolRegistryType };
