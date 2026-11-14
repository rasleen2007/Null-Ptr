import type { PiiType } from "../sarkari/pii";

export type ProviderId = "gemini" | "groq" | "openrouter" | "ollama";

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  providerMeta?: Record<string, unknown>;
}

export interface ProviderMessage {
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}

export interface StoredMessage {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
  provider?: ProviderId;
  model?: string;
  tokenEstimate?: number;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  systemPrompt?: string;
  pinned: boolean;
  messageCount: number;
  lastMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemoryRecord {
  id: string;
  content: string;
  tags: string[];
  source?: string;
  importance: number;
  accessCount: number;
  lastAccessedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface ExecutionLog {
  id: string;
  runId?: string;
  conversationId?: string;
  level: LogLevel;
  event: string;
  message: string;
  data?: Record<string, unknown>;
  createdAt: string;
}

export type RunStatus =
  | "running"
  | "awaiting_approval"
  | "completed"
  | "cancelled"
  | "failed";

export interface RunState {
  model: string;
  systemPrompt: string;
  temperature: number;
  iteration: number;
  pendingCalls: ToolCall[];
  pendingIndex: number;
  awaitingCall?: ToolCall;
  approvedCallId?: string;
  deniedCallId?: string;
  denialNote?: string;
  useTools?: boolean;
  /** Ingress/outbound redaction summary, safe to show in the UI (never contains values). */
  privacy?: {
    redacted: boolean;
    placeholders: string[];
    types: PiiType[];
    route?: "cloud" | "ollama";
    guardVerified?: boolean;
  };
  /** True when the turn is running on the local model because of unknown PII. */
  tainted?: boolean;
}

export interface RunRecord {
  id: string;
  conversationId?: string;
  kind: "chat" | "agent";
  status: RunStatus;
  input: string;
  state: RunState;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolPermissionSettings {
  allowFileRead: boolean;
  allowFileWrite: boolean;
  allowShell: boolean;
  allowMemoryWrite: boolean;
  allowNetwork: boolean;
}

export interface AppSettings {
  defaultModel: string;
  systemPrompt: string;
  temperature: number;
  maxIterations: number;
  memoryEnabled: boolean;
  memoryLimit: number;
  toolsEnabled: boolean;
  streamResponses: boolean;
  permissions: ToolPermissionSettings;
  updatedAt: string;
}

export type ToolCategory = "utility" | "memory" | "filesystem" | "system" | "web";
export type ToolSensitivity = "safe" | "sensitive";

export interface ToolExecuteContext {
  runId: string;
  conversationId?: string;
  signal: AbortSignal;
  store: import("./storage/types").Storage;
  workspaceDir: string;
  shellAllowlist: string[];
  toolTimeoutMs: number;
}

export interface ToolExecutionResult {
  content: string;
  isError?: boolean;
  data?: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  category: ToolCategory;
  sensitivity: ToolSensitivity;
  /**
   * When true, placeholders in the tool arguments are restored to real vault
   * values immediately before execution, and the result is scrubbed again.
   * Never set this on network tools such as web_fetch or gov_lookup.
   */
  usesVault?: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolExecuteContext) => Promise<ToolExecutionResult>;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: ToolCategory;
  sensitivity: ToolSensitivity;
  usesVault?: boolean;
  parameters: ToolDefinition["parameters"];
  enabled: boolean;
  disabledReason?: string;
}

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  model: string;
  label: string;
  description: string;
  contextWindow: number;
  supportsTools: boolean;
  free: boolean;
  tags: string[];
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  configured: boolean;
  reason?: string;
  detail?: string;
  reachable?: boolean;
  local: boolean;
  docsUrl: string;
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; call: ToolCall }
  | { type: "usage"; promptTokens?: number; completionTokens?: number }
  | { type: "done"; finishReason?: string };

export interface ProviderAdapter {
  id: ProviderId;
  label: string;
  isConfigured: () => boolean;
  missingReason?: () => string | undefined;
  listModels?: () => Promise<ModelInfo[]>;
  stream: (req: ProviderRequest) => AsyncGenerator<ProviderEvent>;
}

export interface RetrievedMemory {
  memory: MemoryRecord;
  score: number;
  matchedTerms: string[];
}

export interface ChatRequest {
  conversationId?: string;
  message: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  kind?: "chat" | "agent";
  useTools?: boolean;
}

export type StreamEvent =
  | { type: "run"; runId: string; conversationId: string; kind: "chat" | "agent" }
  | { type: "title"; conversationId: string; title: string }
  | { type: "iteration"; iteration: number; maxIterations: number }
  | { type: "thinking"; message: string }
  | { type: "delta"; text: string }
  | { type: "tool_call"; runId: string; call: ToolCall; sensitivity: ToolSensitivity; category: ToolCategory }
  | { type: "tool_result"; runId: string; call: ToolCall; content: string; isError: boolean }
  | {
      type: "permission_request";
      runId: string;
      call: ToolCall;
      tool: ToolInfo;
      reason: string;
    }
  | { type: "usage"; promptTokens?: number; completionTokens?: number }
  | {
      type: "privacy";
      runId: string;
      redacted: boolean;
      placeholders: string[];
      types: PiiType[];
      route: "cloud" | "ollama";
      verifiedClean: boolean;
    }
  | {
      type: "memory_recall";
      runId: string;
      memories: RetrievedMemory[];
    }
  | { type: "log"; level: LogLevel; message: string }
  | { type: "error"; message: string; code?: string }
  | {
      type: "done";
      runId: string;
      status: RunStatus;
      messageId?: string;
      reason?: string;
    };

export interface HarnessEventSource {
  runId: string;
  conversationId: string;
  events: AsyncGenerator<StreamEvent>;
}
