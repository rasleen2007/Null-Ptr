import { describe, expect, it } from "vitest";
import type { StoredMessage } from "@/harness/types";
import {
  buildProviderContext,
  estimateTokens,
  groupTurns,
} from "@/harness/context";

let counter = 0;

function message(
  role: StoredMessage["role"],
  content: string,
  overrides: Partial<StoredMessage> = {},
): StoredMessage {
  counter += 1;
  return {
    id: `msg_${counter}`,
    conversationId: "conv_1",
    role,
    content,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("estimateTokens", () => {
  it("uses a chars/4 heuristic", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("groupTurns", () => {
  it("starts a new turn on each user message and skips system messages", () => {
    const turns = groupTurns([
      message("system", "ignored"),
      message("user", "one"),
      message("assistant", "answer one"),
      message("user", "two"),
      message("assistant", "answer two"),
    ]);
    expect(turns).toHaveLength(2);
    expect(turns[0].map((entry) => entry.role)).toEqual(["user", "assistant"]);
    expect(turns[1][0].content).toBe("two");
  });
});

describe("buildProviderContext", () => {
  it("includes system prompt, memory block, and all turns when budget allows", () => {
    const context = buildProviderContext({
      systemPrompt: "You are JARVIS.",
      memoryBlock: "Remembered: dark mode.",
      tokenBudget: 12000,
      messages: [message("user", "Hi"), message("assistant", "Hello")],
    });
    expect(context.trimmedTurns).toBe(0);
    expect(context.messages[0].role).toBe("system");
    expect(context.messages[0].content).toContain("You are JARVIS.");
    expect(context.messages[0].content).toContain("dark mode");
    expect(context.messages.slice(1).map((entry) => entry.content)).toEqual(["Hi", "Hello"]);
  });

  it("trims older turns to fit the token budget while keeping the latest turn", () => {
    const context = buildProviderContext({
      systemPrompt: "You are JARVIS.",
      tokenBudget: 1200,
      messages: [
        message("user", "old question"),
        message("assistant", "x".repeat(8000)),
        message("user", "latest question"),
        message("assistant", "recent answer"),
      ],
    });
    expect(context.trimmedTurns).toBeGreaterThanOrEqual(1);
    expect(context.messages[0].content).toContain("older conversation turn(s) were trimmed");
    const contents = context.messages.map((entry) => entry.content);
    expect(contents).toContain("latest question");
    expect(contents).toContain("recent answer");
    expect(contents).not.toContain("old question");
  });

  it("always keeps the latest turn even if it exceeds the budget", () => {
    const huge = "y".repeat(12000);
    const context = buildProviderContext({
      systemPrompt: "System",
      tokenBudget: 500,
      messages: [message("user", "start"), message("assistant", huge)],
    });
    expect(context.messages.some((entry) => entry.content === huge)).toBe(true);
  });
});
