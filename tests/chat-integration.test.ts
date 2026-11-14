import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";
import {
  collectEvents,
  eventTypes,
  finalEvent,
  setupHarness,
  textFrom,
  type TestHarnessContext,
} from "./helpers/harness";

let fake: FakeOllama;
let ctx: TestHarnessContext | undefined;

beforeEach(async () => {
  fake = await startFakeOllama();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await ctx?.cleanup();
  ctx = undefined;
  await fake.close();
});

describe("chat end-to-end through the harness", () => {
  it("creates a conversation, streams a response, persists history, and reloads it", async () => {
    ctx = await setupHarness(fake.url);
    const source = await ctx.harness.startChat({
      message: "Hello JARVIS",
      model: "ollama:fake-chat",
    });

    expect(source.conversationId).toMatch(/^conv_/);
    expect(source.runId).toMatch(/^run_/);

    const events = await collectEvents(source);
    const types = eventTypes(events);
    expect(types).toEqual(expect.arrayContaining(["run", "title", "iteration", "thinking", "delta", "done"]));
    expect(types.filter((type) => type === "delta").length).toBeGreaterThanOrEqual(2);
    expect(textFrom(events)).toBe("Hello from fake Ollama.");

    const done = finalEvent(events);
    expect(done.status).toBe("completed");
    expect(done.messageId).toBeTruthy();

    const conversation = await ctx.store.getConversation(source.conversationId);
    expect(conversation).toMatchObject({
      title: "Hello JARVIS",
      model: "ollama:fake-chat",
      messageCount: 2,
    });

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[0].content).toBe("Hello JARVIS");
    expect(messages[1].content).toBe("Hello from fake Ollama.");
    expect(messages[1].provider).toBe("ollama");
    expect(messages[1].model).toBe("ollama:fake-chat");

    const reloadedHarness = await ctx.recreate();
    const reloadedConversation = await reloadedHarness.store.getConversation(source.conversationId);
    const reloadedMessages = await reloadedHarness.store.listMessages(source.conversationId);
    expect(reloadedConversation?.title).toBe("Hello JARVIS");
    expect(reloadedMessages).toHaveLength(2);
    expect(reloadedMessages[1].content).toBe("Hello from fake Ollama.");
  });

  it("continues an existing conversation and stores the full history", async () => {
    ctx = await setupHarness(fake.url);
    const first = await ctx.harness.startChat({
      message: "First message",
      model: "ollama:fake-chat",
    });
    await collectEvents(first);

    const second = await ctx.harness.startChat({
      conversationId: first.conversationId,
      message: "Second message",
      model: "ollama:fake-chat",
    });
    expect(second.conversationId).toBe(first.conversationId);
    const events = await collectEvents(second);
    expect(finalEvent(events).status).toBe("completed");

    const messages = await ctx.store.listMessages(first.conversationId);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "user",
      "assistant",
    ]);
    expect(messages.map((message) => message.content)).toEqual([
      "First message",
      "Hello from fake Ollama.",
      "Second message",
      "Hello from fake Ollama.",
    ]);
  });

  it("switches providers mid-conversation and preserves prior history in the request", async () => {
    ctx = await setupHarness(fake.url, { groqApiKey: "test-key" });
    const first = await ctx.harness.startChat({
      message: "Start with Ollama",
      model: "ollama:fake-chat",
    });
    await collectEvents(first);

    const realFetch = globalThis.fetch.bind(globalThis);
    let captured: { authorization?: string; body?: Record<string, unknown> } = {};
    const groqSse = [
      'data: {"choices":[{"delta":{"content":"Groq says "},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{"content":"hello."},"finish_reason":null}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n");

    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.startsWith("https://api.groq.com/openai/v1/chat/completions")) {
        captured = {
          authorization: (init?.headers as Record<string, string> | undefined)?.Authorization,
          body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
        };
        return new Response(groqSse, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }
      return realFetch(input, init);
    });

    const second = await ctx.harness.startChat({
      conversationId: first.conversationId,
      message: "Now use Groq",
      model: "groq:llama-3.3-70b-versatile",
    });
    const events = await collectEvents(second);
    expect(textFrom(events)).toBe("Groq says hello.");
    expect(finalEvent(events).status).toBe("completed");

    expect(captured.authorization).toBe("Bearer test-key");
    expect(captured.body?.model).toBe("llama-3.3-70b-versatile");
    const sentMessages = captured.body?.messages as { role: string; content: string }[];
    expect(sentMessages.map((message) => message.content)).toEqual(
      expect.arrayContaining(["Start with Ollama", "Hello from fake Ollama.", "Now use Groq"]),
    );

    const messages = await ctx.store.listMessages(first.conversationId);
    expect(messages).toHaveLength(4);
    expect(messages[3].provider).toBe("groq");
    expect(messages[3].model).toBe("groq:llama-3.3-70b-versatile");
    expect(messages[3].content).toBe("Groq says hello.");
  });

  it("rejects a model whose provider has no credentials", async () => {
    ctx = await setupHarness(fake.url);
    await expect(
      ctx.harness.startChat({
        message: "This should fail",
        model: "groq:llama-3.3-70b-versatile",
      }),
    ).rejects.toMatchObject({
      code: "provider_not_configured",
      status: 400,
    });

    expect(await ctx.store.listConversations()).toHaveLength(0);
  });

  it("surfaces provider errors with retry and marks the run failed", async () => {
    ctx = await setupHarness(fake.url);
    const events = await collectEvents(
      await ctx.harness.startChat({
        message: "Trigger a provider error",
        model: "ollama:fake-error",
      }),
    );

    const error = events.find((event) => event.type === "error");
    expect(error).toMatchObject({ type: "error", code: "provider_error" });
    expect((error as { message: string }).message).toContain("fake provider explosion");
    expect(finalEvent(events).status).toBe("failed");
    expect(fake.chatRequests().length).toBe(2);

    const runs = await ctx.store.listRuns();
    expect(runs[0].status).toBe("failed");
    expect(runs[0].error).toContain("fake provider explosion");
  });

  it("handles empty provider responses as failures", async () => {
    ctx = await setupHarness(fake.url);
    const events = await collectEvents(
      await ctx.harness.startChat({
        message: "Return nothing",
        model: "ollama:fake-empty",
      }),
    );
    expect(events.find((event) => event.type === "error")).toMatchObject({
      code: "empty_response",
    });
    expect(finalEvent(events).status).toBe("failed");
  });

  it("times out a stalled provider", async () => {
    ctx = await setupHarness(fake.url, { providerTimeoutMs: 150 });
    const events = await collectEvents(
      await ctx.harness.startChat({
        message: "Hang forever",
        model: "ollama:fake-timeout",
      }),
    );
    const error = events.find((event) => event.type === "error");
    expect(error).toMatchObject({ code: "provider_error" });
    expect((error as { message: string }).message).toMatch(/timed out|unreachable|cancelled/i);
    expect(finalEvent(events).status).toBe("failed");
  });

  it("cancels an active stream and persists an interruption marker", async () => {
    ctx = await setupHarness(fake.url);
    const source = await ctx.harness.startChat({
      message: "Generate slowly",
      model: "ollama:fake-slow",
    });

    const iterator = source.events[Symbol.asyncIterator]();
    const events: Awaited<ReturnType<typeof collectEvents>> = [];
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      events.push(next.value);
      if (next.value.type === "delta") break;
    }
    expect(events.some((event) => event.type === "delta")).toBe(true);

    expect(await ctx.harness.cancelRun(source.runId)).toBe(true);
    while (true) {
      const next = await iterator.next();
      if (next.done) break;
      events.push(next.value);
    }

    expect(finalEvent(events).status).toBe("cancelled");
    const run = await ctx.store.getRun(source.runId);
    expect(run?.status).toBe("cancelled");

    const messages = await ctx.store.listMessages(source.conversationId);
    const last = messages[messages.length - 1];
    expect(last.role).toBe("assistant");
    expect(last.content).toContain("[Interrupted before completion]");
  });

  it("rejects empty and oversized messages before creating anything", async () => {
    ctx = await setupHarness(fake.url);
    await expect(
      ctx.harness.startChat({ message: "   ", model: "ollama:fake-chat" }),
    ).rejects.toMatchObject({ code: "validation_error", status: 400 });
    await expect(
      ctx.harness.startChat({ message: "x".repeat(30_001), model: "ollama:fake-chat" }),
    ).rejects.toMatchObject({ code: "validation_error", status: 400 });
    expect(await ctx.store.listConversations()).toHaveLength(0);
    expect(fake.chatRequests()).toHaveLength(0);
  });

  it("injects retrieved memories into the provider prompt", async () => {
    ctx = await setupHarness(fake.url);
    await ctx.store.createMemory({
      content: "The launch deadline is March 14",
      tags: ["project"],
      importance: 0.9,
    });

    await collectEvents(
      await ctx.harness.startChat({
        message: "When is the launch deadline?",
        model: "ollama:fake-chat",
      }),
    );

    const request = fake.chatRequests()[0];
    const messages = request.body?.messages as { role: string; content: string }[];
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("The launch deadline is March 14");
  });
});
