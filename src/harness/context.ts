import type { ProviderMessage, StoredMessage } from "./types";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toProviderMessage(message: StoredMessage): ProviderMessage {
  return {
    role: message.role,
    content: message.content,
    toolCalls: message.toolCalls,
    toolCallId: message.toolCallId,
    toolName: message.toolName,
  };
}

export function groupTurns(messages: StoredMessage[]): ProviderMessage[][] {
  const turns: ProviderMessage[][] = [];
  let current: ProviderMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "user" && current.length) {
      turns.push(current);
      current = [];
    }
    current.push(toProviderMessage(message));
  }
  if (current.length) turns.push(current);
  return turns;
}

export interface BuildContextOptions {
  systemPrompt: string;
  messages: StoredMessage[];
  memoryBlock?: string;
  tokenBudget: number;
}

export interface BuiltContext {
  messages: ProviderMessage[];
  trimmedTurns: number;
  estimatedTokens: number;
}

export function buildProviderContext(options: BuildContextOptions): BuiltContext {
  const memoryBlock = options.memoryBlock?.trim();
  const baseSystem = [options.systemPrompt.trim(), memoryBlock].filter(Boolean).join("\n\n");
  const turns = groupTurns(options.messages);

  const reserved = estimateTokens(baseSystem) + 200;
  let remaining = Math.max(1000, options.tokenBudget - reserved);
  const selected: ProviderMessage[][] = [];

  for (let i = turns.length - 1; i >= 0; i -= 1) {
    const turn = turns[i];
    const cost = turn.reduce(
      (sum, message) =>
        sum +
        estimateTokens(message.content) +
        (message.toolCalls ? estimateTokens(JSON.stringify(message.toolCalls)) : 0),
      8,
    );
    if (cost <= remaining || selected.length === 0) {
      selected.unshift(turn);
      remaining -= cost;
    } else {
      break;
    }
  }

  const trimmedTurns = turns.length - selected.length;
  const systemPrompt = trimmedTurns
    ? `${baseSystem}\n\n[Note: ${trimmedTurns} older conversation turn(s) were trimmed to fit the context budget.]`
    : baseSystem;

  const contextMessages: ProviderMessage[] = systemPrompt
    ? [{ role: "system", content: systemPrompt }]
    : [];
  for (const turn of selected) contextMessages.push(...turn);

  return {
    messages: contextMessages,
    trimmedTurns,
    estimatedTokens: contextMessages.reduce(
      (sum, message) =>
        sum +
        estimateTokens(message.content) +
        (message.toolCalls ? estimateTokens(JSON.stringify(message.toolCalls)) : 0),
      0,
    ),
  };
}

