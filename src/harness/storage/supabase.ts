import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type {
  AppSettings,
  Conversation,
  ExecutionLog,
  MemoryRecord,
  RunRecord,
  StoredMessage,
} from "../types";
import { createDefaultSettings } from "../config";
import { createId } from "../utils";
import type {
  AddLogInput,
  AddMessageInput,
  CreateConversationInput,
  CreateMemoryInput,
  CreateRunInput,
  ListLogsFilter,
  Storage,
} from "./types";

interface ConversationRow {
  id: string;
  title: string;
  model: string;
  system_prompt: string | null;
  pinned: boolean;
  message_count: number;
  last_message: string | null;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: StoredMessage["role"];
  content: string;
  tool_calls: StoredMessage["toolCalls"] | null;
  tool_call_id: string | null;
  tool_name: string | null;
  provider: StoredMessage["provider"] | null;
  model: string | null;
  token_estimate: number | null;
  created_at: string;
}

interface MemoryRow {
  id: string;
  content: string;
  tags: string[] | null;
  source: string | null;
  importance: number | null;
  access_count: number | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LogRow {
  id: string;
  run_id: string | null;
  conversation_id: string | null;
  level: ExecutionLog["level"];
  event: string;
  message: string;
  data: Record<string, unknown> | null;
  created_at: string;
}

interface RunRow {
  id: string;
  conversation_id: string | null;
  kind: RunRecord["kind"];
  status: RunRecord["status"];
  input: string;
  state: RunRecord["state"];
  error: string | null;
  created_at: string;
  updated_at: string;
}

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    model: row.model,
    systemPrompt: row.system_prompt ?? undefined,
    pinned: row.pinned,
    messageCount: row.message_count,
    lastMessage: row.last_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    toolCalls: row.tool_calls ?? undefined,
    toolCallId: row.tool_call_id ?? undefined,
    toolName: row.tool_name ?? undefined,
    provider: row.provider ?? undefined,
    model: row.model ?? undefined,
    tokenEstimate: row.token_estimate ?? undefined,
    createdAt: row.created_at,
  };
}

function toMemory(row: MemoryRow): MemoryRecord {
  return {
    id: row.id,
    content: row.content,
    tags: row.tags ?? [],
    source: row.source ?? undefined,
    importance: row.importance ?? 0.5,
    accessCount: row.access_count ?? 0,
    lastAccessedAt: row.last_accessed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toLog(row: LogRow): ExecutionLog {
  return {
    id: row.id,
    runId: row.run_id ?? undefined,
    conversationId: row.conversation_id ?? undefined,
    level: row.level,
    event: row.event,
    message: row.message,
    data: row.data ?? undefined,
    createdAt: row.created_at,
  };
}

function toRun(row: RunRow): RunRecord {
  return {
    id: row.id,
    conversationId: row.conversation_id ?? undefined,
    kind: row.kind,
    status: row.status,
    input: row.input,
    state: row.state,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertOk<T>(result: { data: T | null; error: { message: string } | null }, context: string): T {
  if (result.error) {
    throw new Error(`[jarvis/supabase] ${context}: ${result.error.message}`);
  }
  return result.data as T;
}

export function createSupabaseStorage(url: string, serviceRoleKey: string): Storage {
  const client: SupabaseClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  async function getSettings(): Promise<AppSettings> {
    const result = await client.from("jarvis_settings").select("data").eq("id", "global").maybeSingle();
    if (result.error) throw new Error(`[jarvis/supabase] settings: ${result.error.message}`);
    if (result.data?.data) {
      return { ...createDefaultSettings(), ...(result.data.data as AppSettings) };
    }
    const defaults = createDefaultSettings();
    const insert = await client.from("jarvis_settings").upsert({ id: "global", data: defaults });
    if (insert.error) throw new Error(`[jarvis/supabase] settings init: ${insert.error.message}`);
    return defaults;
  }

  async function touchConversation(conversationId: string, delta: number): Promise<void> {
    const current = await client
      .from("jarvis_conversations")
      .select("message_count,last_message")
      .eq("id", conversationId)
      .maybeSingle();
    if (current.error || !current.data) return;
    await client
      .from("jarvis_conversations")
      .update({
        message_count: Math.max(0, (current.data.message_count ?? 0) + delta),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);
  }

  return {
    kind: "supabase",

    async listConversations() {
      const result = await client
        .from("jarvis_conversations")
        .select("*")
        .order("updated_at", { ascending: false });
      return (assertOk(result, "listConversations") as ConversationRow[]).map(toConversation);
    },

    async searchConversations(query: string) {
      const needle = query.trim().slice(0, 100);
      if (!needle) return this.listConversations();
      const ids = new Set<string>();
      const byTitle = await client
        .from("jarvis_conversations")
        .select("id")
        .ilike("title", `%${needle}%`)
        .limit(50);
      if (byTitle.error) throw new Error(`[jarvis/supabase] searchConversations: ${byTitle.error.message}`);
      for (const row of byTitle.data ?? []) ids.add((row as { id: string }).id);
      const byMessage = await client
        .from("jarvis_messages")
        .select("conversation_id")
        .ilike("content", `%${needle}%`)
        .limit(200);
      if (byMessage.error) throw new Error(`[jarvis/supabase] searchConversations: ${byMessage.error.message}`);
      for (const row of byMessage.data ?? []) ids.add((row as { conversation_id: string }).conversation_id);
      if (!ids.size) return [];
      const result = await client
        .from("jarvis_conversations")
        .select("*")
        .in("id", [...ids])
        .order("updated_at", { ascending: false })
        .limit(50);
      return (assertOk(result, "searchConversations") as ConversationRow[]).map(toConversation);
    },

    async getConversation(id) {
      const result = await client
        .from("jarvis_conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (result.error) throw new Error(`[jarvis/supabase] getConversation: ${result.error.message}`);
      return result.data ? toConversation(result.data as ConversationRow) : null;
    },

    async createConversation(input: CreateConversationInput) {
      const now = new Date().toISOString();
      const conversation: Conversation = {
        id: createId("conv"),
        title: input.title,
        model: input.model,
        systemPrompt: input.systemPrompt,
        pinned: false,
        messageCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const result = await client.from("jarvis_conversations").insert({
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        system_prompt: conversation.systemPrompt ?? null,
        pinned: false,
        message_count: 0,
        created_at: now,
        updated_at: now,
      });
      if (result.error) throw new Error(`[jarvis/supabase] createConversation: ${result.error.message}`);
      return conversation;
    },

    async updateConversation(id, patch) {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.model !== undefined) payload.model = patch.model;
      if (patch.systemPrompt !== undefined) payload.system_prompt = patch.systemPrompt;
      if (patch.pinned !== undefined) payload.pinned = patch.pinned;
      const result = await client
        .from("jarvis_conversations")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (result.error) throw new Error(`[jarvis/supabase] updateConversation: ${result.error.message}`);
      return result.data ? toConversation(result.data as ConversationRow) : null;
    },

    async deleteConversation(id) {
      await client.from("jarvis_messages").delete().eq("conversation_id", id);
      await client.from("jarvis_runs").delete().eq("conversation_id", id);
      const result = await client.from("jarvis_conversations").delete().eq("id", id);
      if (result.error) throw new Error(`[jarvis/supabase] deleteConversation: ${result.error.message}`);
    },

    async listMessages(conversationId) {
      const result = await client
        .from("jarvis_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return (assertOk(result, "listMessages") as MessageRow[]).map(toMessage);
    },

    async addMessage(input: AddMessageInput) {
      const now = new Date().toISOString();
      const message: StoredMessage = {
        id: createId("msg"),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        toolCalls: input.toolCalls,
        toolCallId: input.toolCallId,
        toolName: input.toolName,
        provider: input.provider,
        model: input.model,
        tokenEstimate: input.tokenEstimate ?? Math.ceil(input.content.length / 4),
        createdAt: now,
      };
      const result = await client.from("jarvis_messages").insert({
        id: message.id,
        conversation_id: message.conversationId,
        role: message.role,
        content: message.content,
        tool_calls: message.toolCalls ?? null,
        tool_call_id: message.toolCallId ?? null,
        tool_name: message.toolName ?? null,
        provider: message.provider ?? null,
        model: message.model ?? null,
        token_estimate: message.tokenEstimate ?? null,
        created_at: now,
      });
      if (result.error) throw new Error(`[jarvis/supabase] addMessage: ${result.error.message}`);
      await touchConversation(input.conversationId, 1);
      await client
        .from("jarvis_conversations")
        .update({ last_message: input.content.slice(0, 180) })
        .eq("id", input.conversationId);
      return message;
    },

    async clearMessages(conversationId) {
      const result = await client.from("jarvis_messages").delete().eq("conversation_id", conversationId);
      if (result.error) throw new Error(`[jarvis/supabase] clearMessages: ${result.error.message}`);
      await client
        .from("jarvis_conversations")
        .update({ message_count: 0, last_message: null, updated_at: new Date().toISOString() })
        .eq("id", conversationId);
    },

    async listMemories(limit = 500) {
      const result = await client
        .from("jarvis_memories")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);
      return (assertOk(result, "listMemories") as MemoryRow[]).map(toMemory);
    },

    async createMemory(input: CreateMemoryInput) {
      const now = new Date().toISOString();
      const memory: MemoryRecord = {
        id: createId("mem"),
        content: input.content.trim(),
        tags: input.tags ?? [],
        source: input.source,
        importance: Math.min(1, Math.max(0, input.importance ?? 0.5)),
        accessCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      const result = await client.from("jarvis_memories").insert({
        id: memory.id,
        content: memory.content,
        tags: memory.tags,
        source: memory.source ?? null,
        importance: memory.importance,
        access_count: 0,
        created_at: now,
        updated_at: now,
      });
      if (result.error) throw new Error(`[jarvis/supabase] createMemory: ${result.error.message}`);
      return memory;
    },

    async updateMemory(id, patch) {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.content !== undefined) payload.content = patch.content;
      if (patch.tags !== undefined) payload.tags = patch.tags;
      if (patch.importance !== undefined) payload.importance = patch.importance;
      if (patch.accessCount !== undefined) payload.access_count = patch.accessCount;
      if (patch.lastAccessedAt !== undefined) payload.last_accessed_at = patch.lastAccessedAt;
      const result = await client
        .from("jarvis_memories")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (result.error) throw new Error(`[jarvis/supabase] updateMemory: ${result.error.message}`);
      return result.data ? toMemory(result.data as MemoryRow) : null;
    },

    async deleteMemory(id) {
      const result = await client.from("jarvis_memories").delete().eq("id", id);
      if (result.error) throw new Error(`[jarvis/supabase] deleteMemory: ${result.error.message}`);
    },

    async addLog(input: AddLogInput) {
      const log: ExecutionLog = {
        id: createId("log"),
        runId: input.runId,
        conversationId: input.conversationId,
        level: input.level,
        event: input.event,
        message: input.message,
        data: input.data,
        createdAt: new Date().toISOString(),
      };
      const result = await client.from("jarvis_logs").insert({
        id: log.id,
        run_id: log.runId ?? null,
        conversation_id: log.conversationId ?? null,
        level: log.level,
        event: log.event,
        message: log.message,
        data: log.data ?? null,
        created_at: log.createdAt,
      });
      if (result.error) throw new Error(`[jarvis/supabase] addLog: ${result.error.message}`);
      return log;
    },

    async listLogs(filter: ListLogsFilter = {}) {
      let query = client.from("jarvis_logs").select("*");
      if (filter.runId) query = query.eq("run_id", filter.runId);
      if (filter.conversationId) query = query.eq("conversation_id", filter.conversationId);
      if (filter.level) query = query.eq("level", filter.level);
      const result = await query.order("created_at", { ascending: false }).limit(filter.limit ?? 200);
      return (assertOk(result, "listLogs") as LogRow[]).map(toLog);
    },

    async clearLogs() {
      const result = await client.from("jarvis_logs").delete().neq("id", "");
      if (result.error) throw new Error(`[jarvis/supabase] clearLogs: ${result.error.message}`);
    },

    async createRun(input: CreateRunInput) {
      const now = new Date().toISOString();
      const run: RunRecord = {
        id: input.id,
        conversationId: input.conversationId,
        kind: input.kind,
        status: input.status,
        input: input.input,
        state: input.state,
        createdAt: now,
        updatedAt: now,
      };
      const result = await client.from("jarvis_runs").insert({
        id: run.id,
        conversation_id: run.conversationId ?? null,
        kind: run.kind,
        status: run.status,
        input: run.input,
        state: run.state,
        created_at: now,
        updated_at: now,
      });
      if (result.error) throw new Error(`[jarvis/supabase] createRun: ${result.error.message}`);
      return run;
    },

    async getRun(id) {
      const result = await client.from("jarvis_runs").select("*").eq("id", id).maybeSingle();
      if (result.error) throw new Error(`[jarvis/supabase] getRun: ${result.error.message}`);
      return result.data ? toRun(result.data as RunRow) : null;
    },

    async updateRun(id, patch) {
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (patch.status !== undefined) payload.status = patch.status;
      if (patch.state !== undefined) payload.state = patch.state;
      if (patch.error !== undefined) payload.error = patch.error;
      const result = await client
        .from("jarvis_runs")
        .update(payload)
        .eq("id", id)
        .select("*")
        .maybeSingle();
      if (result.error) throw new Error(`[jarvis/supabase] updateRun: ${result.error.message}`);
      return result.data ? toRun(result.data as RunRow) : null;
    },

    async listRuns(limit = 50) {
      const result = await client
        .from("jarvis_runs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      return (assertOk(result, "listRuns") as RunRow[]).map(toRun);
    },

    async deleteRun(id) {
      const logs = await client.from("jarvis_logs").delete().eq("run_id", id);
      if (logs.error) throw new Error(`[jarvis/supabase] deleteRun logs: ${logs.error.message}`);
      const result = await client.from("jarvis_runs").delete().eq("id", id);
      if (result.error) throw new Error(`[jarvis/supabase] deleteRun: ${result.error.message}`);
    },

    async clearRuns() {
      const result = await client.from("jarvis_runs").delete().neq("id", "");
      if (result.error) throw new Error(`[jarvis/supabase] clearRuns: ${result.error.message}`);
    },

    getSettings,

    async updateSettings(patch) {
      const current = await getSettings();
      const next: AppSettings = {
        ...current,
        ...patch,
        permissions: { ...current.permissions, ...(patch.permissions ?? {}) },
        updatedAt: new Date().toISOString(),
      };
      const result = await client.from("jarvis_settings").upsert({ id: "global", data: next });
      if (result.error) throw new Error(`[jarvis/supabase] updateSettings: ${result.error.message}`);
      return next;
    },
  };
}
