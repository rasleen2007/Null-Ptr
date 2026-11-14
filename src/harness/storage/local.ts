import { promises as fs } from "node:fs";
import path from "node:path";
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

interface LocalDatabase {
  version: number;
  conversations: Conversation[];
  messages: StoredMessage[];
  memories: MemoryRecord[];
  logs: ExecutionLog[];
  runs: RunRecord[];
  settings: AppSettings;
}

const DB_VERSION = 1;

function emptyDatabase(): LocalDatabase {
  return {
    version: DB_VERSION,
    conversations: [],
    messages: [],
    memories: [],
    logs: [],
    runs: [],
    settings: createDefaultSettings(),
  };
}

function makeMutex() {
  let tail: Promise<void> = Promise.resolve();
  return function run<T>(fn: () => Promise<T>): Promise<T> {
    const next = tail.then(fn, fn);
    tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

export function createLocalStorage(options: { dataFile?: string } = {}): Storage {
  const dataFile =
    options.dataFile ??
    process.env.JARVIS_DATA_FILE ??
    path.join(process.cwd(), ".data", "jarvis.json");
  const mutex = makeMutex();
  let cache: LocalDatabase | null = null;

  async function load(): Promise<LocalDatabase> {
    if (cache) return cache;
    try {
      const raw = await fs.readFile(dataFile, "utf8");
      const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
      cache = {
        ...emptyDatabase(),
        ...parsed,
        conversations: parsed.conversations ?? [],
        messages: parsed.messages ?? [],
        memories: parsed.memories ?? [],
        logs: parsed.logs ?? [],
        runs: parsed.runs ?? [],
        settings: { ...createDefaultSettings(), ...(parsed.settings ?? {}) },
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(`[jarvis] Could not read local store (${dataFile}); starting fresh.`, error);
      }
      cache = emptyDatabase();
    }
    return cache;
  }

  async function persist(db: LocalDatabase): Promise<void> {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(db, null, 2), "utf8");
    await fs.rename(tmp, dataFile);
  }

  async function read<T>(fn: (db: LocalDatabase) => T): Promise<T> {
    const db = await load();
    return fn(db);
  }

  async function write<T>(fn: (db: LocalDatabase) => T): Promise<T> {
    return mutex(async () => {
      const db = await load();
      const result = fn(db);
      await persist(db);
      return result;
    });
  }

  return {
    kind: "local",

    listConversations: () =>
      read((db) => [...db.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),

    searchConversations: (query) =>
      read((db) => {
        const needle = query.trim().toLowerCase();
        if (!needle) return [...db.conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const ids = new Set<string>();
        for (const conversation of db.conversations) {
          if (
            conversation.title.toLowerCase().includes(needle) ||
            (conversation.lastMessage ?? "").toLowerCase().includes(needle)
          ) {
            ids.add(conversation.id);
          }
        }
        for (const message of db.messages) {
          if (message.content.toLowerCase().includes(needle)) ids.add(message.conversationId);
        }
        return db.conversations
          .filter((conversation) => ids.has(conversation.id))
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      }),

    getConversation: (id) => read((db) => db.conversations.find((c) => c.id === id) ?? null),

    createConversation: (input: CreateConversationInput) =>
      write((db) => {
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
        db.conversations.push(conversation);
        return conversation;
      }),

    updateConversation: (id, patch) =>
      write((db) => {
        const conversation = db.conversations.find((c) => c.id === id);
        if (!conversation) return null;
        Object.assign(conversation, patch, { updatedAt: new Date().toISOString() });
        return conversation;
      }),

    deleteConversation: (id) =>
      write((db) => {
        db.conversations = db.conversations.filter((c) => c.id !== id);
        db.messages = db.messages.filter((m) => m.conversationId !== id);
        db.runs = db.runs.filter((r) => r.conversationId !== id);
      }),

    listMessages: (conversationId) =>
      read((db) =>
        db.messages
          .filter((m) => m.conversationId === conversationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      ),

    addMessage: (input: AddMessageInput) =>
      write((db) => {
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
        db.messages.push(message);
        const conversation = db.conversations.find((c) => c.id === input.conversationId);
        if (conversation) {
          conversation.messageCount += 1;
          conversation.lastMessage = input.content.slice(0, 180);
          conversation.updatedAt = now;
        }
        return message;
      }),

    clearMessages: (conversationId) =>
      write((db) => {
        db.messages = db.messages.filter((m) => m.conversationId !== conversationId);
        const conversation = db.conversations.find((c) => c.id === conversationId);
        if (conversation) {
          conversation.messageCount = 0;
          conversation.lastMessage = undefined;
          conversation.updatedAt = new Date().toISOString();
        }
      }),

    listMemories: (limit = 500) =>
      read((db) =>
        [...db.memories]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, Math.max(1, limit)),
      ),

    createMemory: (input: CreateMemoryInput) =>
      write((db) => {
        const now = new Date().toISOString();
        const memory: MemoryRecord = {
          id: createId("mem"),
          content: input.content.trim(),
          tags: (input.tags ?? []).map((t) => t.trim()).filter(Boolean),
          source: input.source,
          importance: Math.min(1, Math.max(0, input.importance ?? 0.5)),
          accessCount: 0,
          createdAt: now,
          updatedAt: now,
        };
        db.memories.push(memory);
        return memory;
      }),

    updateMemory: (id, patch) =>
      write((db) => {
        const memory = db.memories.find((m) => m.id === id);
        if (!memory) return null;
        Object.assign(memory, patch, { updatedAt: new Date().toISOString() });
        return memory;
      }),

    deleteMemory: (id) =>
      write((db) => {
        db.memories = db.memories.filter((m) => m.id !== id);
      }),

    addLog: (input: AddLogInput) =>
      write((db) => {
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
        db.logs.push(log);
        if (db.logs.length > 2000) db.logs = db.logs.slice(-2000);
        return log;
      }),

    listLogs: (filter: ListLogsFilter = {}) =>
      read((db) => {
        let logs = db.logs;
        if (filter.runId) logs = logs.filter((l) => l.runId === filter.runId);
        if (filter.conversationId)
          logs = logs.filter((l) => l.conversationId === filter.conversationId);
        if (filter.level) logs = logs.filter((l) => l.level === filter.level);
        return [...logs]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, filter.limit ?? 200);
      }),

    clearLogs: () =>
      write((db) => {
        db.logs = [];
      }),

    createRun: (input: CreateRunInput) =>
      write((db) => {
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
        db.runs.push(run);
        if (db.runs.length > 300) db.runs = db.runs.slice(-300);
        return run;
      }),

    getRun: (id) => read((db) => db.runs.find((r) => r.id === id) ?? null),

    updateRun: (id, patch) =>
      write((db) => {
        const run = db.runs.find((r) => r.id === id);
        if (!run) return null;
        Object.assign(run, patch, { updatedAt: new Date().toISOString() });
        return run;
      }),

    listRuns: (limit = 50) =>
      read((db) =>
        [...db.runs]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, Math.max(1, limit)),
      ),

    getSettings: () => read((db) => db.settings),

    updateSettings: (patch) =>
      write((db) => {
        db.settings = {
          ...db.settings,
          ...patch,
          permissions: { ...db.settings.permissions, ...(patch.permissions ?? {}) },
          updatedAt: new Date().toISOString(),
        };
        return db.settings;
      }),
  };
}
