import type { AppSettings } from "./types";
import { DEFAULT_MODEL_ID } from "./providers/catalog";

export const DEFAULT_SYSTEM_PROMPT = `You are JARVIS, a precise and capable personal AI assistant running inside a modular harness built by your user.

Operating rules:
- Be direct, accurate and helpful. Prefer concrete answers over filler.
- You have access to tools. Use them when they materially improve the answer.
- Never invent tool results. If a tool fails, say so plainly.
- Sensitive tools (filesystem writes, shell commands) require explicit human approval. Explain what you want to do before requesting it.
- Retrieved long-term memories are provided as context. Treat them as possibly stale notes, not absolute truth.
- When you learn a durable fact about the user that will matter later, use memory_save.
- Format code with fenced code blocks and use Markdown for structure.`;

export interface ServerConfig {
  geminiApiKey?: string;
  groqApiKey?: string;
  openRouterApiKey?: string;
  openRouterSiteUrl: string;
  openRouterAppName: string;
  ollamaBaseUrl: string;
  /** Model used when unknown PII forces a local-only turn. */
  localModel: string;
  supabaseUrl?: string;
  supabaseServiceRoleKey?: string;
  defaultModel: string;
  maxIterations: number;
  providerTimeoutMs: number;
  toolTimeoutMs: number;
  contextTokenBudget: number;
  memoryLimit: number;
  workspaceDir: string;
  shellAllowlist: string[];
  enableShell: boolean;
}

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getServerConfig(): ServerConfig {
  const env = process.env;
  return {
    geminiApiKey: env.GEMINI_API_KEY?.trim() || undefined,
    groqApiKey: env.GROQ_API_KEY?.trim() || undefined,
    openRouterApiKey: env.OPENROUTER_API_KEY?.trim() || undefined,
    openRouterSiteUrl: env.OPENROUTER_SITE_URL?.trim() || "http://localhost:3000",
    openRouterAppName: env.OPENROUTER_APP_NAME?.trim() || "JARVIS AI Harness",
    ollamaBaseUrl: (env.OLLAMA_BASE_URL?.trim() || "http://localhost:11434").replace(/\/+$/, ""),
    localModel:
      env.SARKARI_LOCAL_MODEL?.trim() ||
      env.JARVIS_LOCAL_MODEL?.trim() ||
      "ollama:llama3.2",
    supabaseUrl: env.SUPABASE_URL?.trim() || undefined,
    supabaseServiceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined,
    defaultModel: env.JARVIS_DEFAULT_MODEL?.trim() || DEFAULT_MODEL_ID,
    maxIterations: Math.min(20, num(env.JARVIS_MAX_ITERATIONS, 6)),
    providerTimeoutMs: Math.min(180000, num(env.JARVIS_PROVIDER_TIMEOUT_MS, 60000)),
    toolTimeoutMs: Math.min(120000, num(env.JARVIS_TOOL_TIMEOUT_MS, 15000)),
    contextTokenBudget: Math.min(200000, num(env.JARVIS_CONTEXT_TOKEN_BUDGET, 12000)),
    memoryLimit: Math.min(20, num(env.JARVIS_MEMORY_LIMIT, 5)),
    workspaceDir: env.JARVIS_WORKSPACE_DIR?.trim() || ".workspace",
    shellAllowlist: (env.JARVIS_SHELL_ALLOWLIST?.trim() || "git,node")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    enableShell: (env.JARVIS_ENABLE_SHELL?.trim() || "false").toLowerCase() === "true",
  };
}

export const DEFAULT_SETTINGS: Omit<AppSettings, "updatedAt"> = {
  defaultModel: DEFAULT_MODEL_ID,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  maxIterations: 6,
  memoryEnabled: true,
  memoryLimit: 5,
  toolsEnabled: true,
  streamResponses: true,
  permissions: {
    allowFileRead: true,
    allowFileWrite: false,
    allowShell: false,
    allowMemoryWrite: true,
    allowNetwork: true,
  },
};

export function createDefaultSettings(config = getServerConfig()): AppSettings {
  const requested = DEFAULT_SETTINGS.defaultModel;
  return {
    ...DEFAULT_SETTINGS,
    defaultModel: config.defaultModel || requested,
    maxIterations: config.maxIterations,
    memoryLimit: config.memoryLimit,
    updatedAt: new Date().toISOString(),
  };
}
