import { accessHeaders } from "@/lib/access-client";
import type {
  AppSettings,
  Conversation,
  ExecutionLog,
  MemoryRecord,
  ModelInfo,
  ProviderStatus,
  RunRecord,
  StoredMessage,
  StreamEvent,
  ToolInfo,
  ToolPermissionSettings,
} from "@/harness/types";

export interface ApiErrorShape {
  error?: string;
  code?: string;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as ApiErrorShape;
    return data.error || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(path, { cache: "no-store", headers: accessHeaders() });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

export async function apiSend<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method,
    headers:
      body === undefined
        ? accessHeaders()
        : { ...accessHeaders(), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

export interface ModelsResponse {
  models: ModelInfo[];
  providers: ProviderStatus[];
  defaultModel: string;
}

let modelsCache: Promise<ModelsResponse> | null = null;

export function loadModels(force = false): Promise<ModelsResponse> {
  if (!modelsCache || force) {
    modelsCache = apiGet<ModelsResponse>("/api/models").catch((error) => {
      modelsCache = null;
      throw error;
    });
  }
  return modelsCache;
}

export function invalidateModelsCache(): void {
  modelsCache = null;
}

export interface ChatRequestBody {
  message: string;
  conversationId?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  kind?: "chat" | "agent";
  useTools?: boolean;
}

async function consumeSse(
  response: Response,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  if (!response.body) throw new Error("The server returned an empty stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = (block: string) => {
    const dataLines = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart());
    if (!dataLines.length) return;
    const payload = dataLines.join("\n");
    if (!payload) return;
    try {
      onEvent(JSON.parse(payload) as StreamEvent);
    } catch {
      // Ignore malformed partial frames.
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        flush(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) flush(buffer);
  } finally {
    reader.releaseLock();
  }
}

export async function streamChatRequest(
  path: string,
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { ...accessHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await parseError(response));
  await consumeSse(response, onEvent);
}

export interface ConversationDetail {
  conversation: Conversation;
  messages: StoredMessage[];
}

export interface HealthResponse {
  ok: boolean;
  version: string;
  storage: "local" | "supabase";
  providers: {
    gemini: boolean;
    groq: boolean;
    openrouter: boolean;
    ollama: { endpoint: string };
  };
  safety: {
    shellEnabled: boolean;
    shellAllowlist: string[];
    workspaceDir: string;
    sensitiveToolsRequireApproval: boolean;
  };
  limits: {
    maxIterations: number;
    providerTimeoutMs: number;
    toolTimeoutMs: number;
    contextTokenBudget: number;
  };
  authRequired?: boolean;
  auth?: {
    required: boolean;
    rateLimitPerMinute: number;
    chatRateLimitPerMinute: number;
  };
}

export interface SettingsResponse {
  settings: AppSettings;
}

export interface ToolsResponse {
  tools: ToolInfo[];
  permissions: ToolPermissionSettings;
}

export interface MemoriesResponse {
  memories: (MemoryRecord & { score?: number })[];
}

export interface RunsResponse {
  runs: RunRecord[];
}

export interface LogsResponse {
  logs: ExecutionLog[];
}

export interface RunResponse {
  run: RunRecord;
}
