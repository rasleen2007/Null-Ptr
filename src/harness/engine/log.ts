import type { LogLevel } from "../types";
import type { Storage } from "../storage/types";
import { redactForModel } from "../../sarkari/tokenizer";

const SENSITIVE_KEY = /(api[-_]?key|token|secret|password|passwd|credential|authorization|cookie)/i;
const MAX_STRING_LENGTH = 400;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 30;
const MAX_DEPTH = 4;

export function redactLogData(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    const scrubbed = redactForModel(value);
    return scrubbed.length > MAX_STRING_LENGTH
      ? `${scrubbed.slice(0, MAX_STRING_LENGTH)}... [truncated]`
      : scrubbed;
  }
  if (depth >= MAX_DEPTH) return "[max depth]";
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY_ITEMS).map((item) => redactLogData(item, depth + 1));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const result: Record<string, unknown> = {};
    for (const [key, item] of entries.slice(0, MAX_OBJECT_KEYS)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactLogData(item, depth + 1);
    }
    if (entries.length > MAX_OBJECT_KEYS) result.__truncatedKeys = entries.length - MAX_OBJECT_KEYS;
    return result;
  }
  return redactForModel(String(value));
}

export async function safeLog(
  store: Storage,
  input: {
    runId?: string;
    conversationId?: string;
    level: LogLevel;
    event: string;
    message: string;
    data?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await store.addLog({
      ...input,
      message: redactForModel(input.message),
      data: input.data ? (redactLogData(input.data) as Record<string, unknown>) : undefined,
    });
  } catch (error) {
    console.warn(`[jarvis] Failed to persist execution log: ${(error as Error).message}`);
  }
}

