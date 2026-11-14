import type { StreamEvent, ToolCall } from "./types";

export function createId(prefix: string): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
      : Math.random().toString(36).slice(2, 18);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function sseEncode(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    if (!raw.trim()) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

export function normalizeToolCall(call: { id?: string; name: string; arguments?: unknown }): ToolCall {
  return {
    id: call.id || createId("call"),
    name: call.name,
    arguments: parseToolArguments(call.arguments),
  };
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… [truncated ${text.length - max} chars]`;
}
