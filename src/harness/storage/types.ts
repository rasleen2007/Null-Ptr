import type {
  AppSettings,
  Conversation,
  ExecutionLog,
  LogLevel,
  MemoryRecord,
  RunRecord,
  StoredMessage,
} from "../types";

export interface CreateConversationInput {
  title: string;
  model: string;
  systemPrompt?: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: StoredMessage["role"];
  content: string;
  toolCalls?: StoredMessage["toolCalls"];
  toolCallId?: string;
  toolName?: string;
  provider?: StoredMessage["provider"];
  model?: string;
  tokenEstimate?: number;
}

export interface CreateMemoryInput {
  content: string;
  tags?: string[];
  source?: string;
  importance?: number;
}

export interface AddLogInput {
  runId?: string;
  conversationId?: string;
  level: LogLevel;
  event: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CreateRunInput {
  id: string;
  conversationId?: string;
  kind: "chat" | "agent";
  status: RunRecord["status"];
  input: string;
  state: RunRecord["state"];
}

export interface ListLogsFilter {
  runId?: string;
  conversationId?: string;
  level?: LogLevel;
  limit?: number;
}

export interface Storage {
  readonly kind: "local" | "supabase";
  listConversations(): Promise<Conversation[]>;
  searchConversations(query: string): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation | null>;
  createConversation(input: CreateConversationInput): Promise<Conversation>;
  updateConversation(
    id: string,
    patch: Partial<Pick<Conversation, "title" | "model" | "systemPrompt" | "pinned">>,
  ): Promise<Conversation | null>;
  deleteConversation(id: string): Promise<void>;
  listMessages(conversationId: string): Promise<StoredMessage[]>;
  addMessage(input: AddMessageInput): Promise<StoredMessage>;
  clearMessages(conversationId: string): Promise<void>;
  listMemories(limit?: number): Promise<MemoryRecord[]>;
  createMemory(input: CreateMemoryInput): Promise<MemoryRecord>;
  updateMemory(
    id: string,
    patch: Partial<Pick<MemoryRecord, "content" | "tags" | "importance" | "accessCount" | "lastAccessedAt">>,
  ): Promise<MemoryRecord | null>;
  deleteMemory(id: string): Promise<void>;
  addLog(input: AddLogInput): Promise<ExecutionLog>;
  listLogs(filter?: ListLogsFilter): Promise<ExecutionLog[]>;
  clearLogs(): Promise<void>;
  createRun(input: CreateRunInput): Promise<RunRecord>;
  getRun(id: string): Promise<RunRecord | null>;
  updateRun(
    id: string,
    patch: Partial<Pick<RunRecord, "status" | "state" | "error">>,
  ): Promise<RunRecord | null>;
  listRuns(limit?: number): Promise<RunRecord[]>;
  deleteRun(id: string): Promise<void>;
  clearRuns(): Promise<void>;
  getSettings(): Promise<AppSettings>;
  updateSettings(patch: Partial<AppSettings>): Promise<AppSettings>;
}
