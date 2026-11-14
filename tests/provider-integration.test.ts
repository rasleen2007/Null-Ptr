import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderEvent, ProviderMessage } from "@/harness/types";
import { ProviderError } from "@/harness/errors";
import { createGeminiAdapter, buildGeminiRequest } from "@/harness/providers/gemini";
import { createOpenAiCompatibleAdapter } from "@/harness/providers/openai-compatible";
import { createOllamaAdapter } from "@/harness/providers/ollama";
import {
  createProviderRegistry,
  getProviderStatuses,
  listAllModels,
  resolveModel,
} from "@/harness/providers";
import { createTestConfig } from "./helpers/harness";
import { startFakeOpenAi, type FakeOpenAi } from "./helpers/fake-openai";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";

const messages: ProviderMessage[] = [
  { role: "system", content: "You are JARVIS." },
  { role: "user", content: "Hello" },
];

async function collect(events: AsyncGenerator<ProviderEvent>): Promise<ProviderEvent[]> {
  const collected: ProviderEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

function textOf(events: ProviderEvent[]): string {
  return events
    .filter((event): event is Extract<ProviderEvent, { type: "text" }> => event.type === "text")
    .map((event) => event.delta)
    .join("");
}

let openai: FakeOpenAi | undefined;
let ollama: FakeOllama | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  await openai?.close();
  openai = undefined;
  await ollama?.close();
  ollama = undefined;
});

describe("OpenAI-compatible providers (Groq and OpenRouter)", () => {
  it("sends auth and model configuration and streams text", async () => {
    openai = await startFakeOpenAi({ validKey: "test-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      apiKey: "test-key",
      baseUrl: openai.url,
      timeoutMs: 3000,
      missingKeyName: "GROQ_API_KEY",
    });

    const events = await collect(
      adapter.stream({ model: "llama-test", messages, temperature: 0.2 }),
    );
    expect(textOf(events)).toBe("Hello from OpenAI-compatible.");
    expect(events.some((event) => event.type === "usage")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });

    const request = openai.requests[0];
    expect(request.path).toBe("/chat/completions");
    expect(request.headers.authorization).toBe("Bearer test-key");
    expect(request.body).toMatchObject({
      model: "llama-test",
      stream: true,
      temperature: 0.2,
    });
    expect(Array.isArray(request.body?.messages)).toBe(true);
  });

  it("parses streamed tool calls", async () => {
    openai = await startFakeOpenAi({ validKey: "test-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      apiKey: "test-key",
      baseUrl: openai.url,
      timeoutMs: 3000,
      missingKeyName: "GROQ_API_KEY",
    });
    const events = await collect(adapter.stream({ model: "tool-model", messages }));
    const toolCall = events.find((event) => event.type === "tool_call");
    expect(toolCall).toMatchObject({
      type: "tool_call",
      call: { name: "calculator", arguments: { expression: "2+2" } },
    });
  });

  it("rejects invalid API keys without leaking the key", async () => {
    openai = await startFakeOpenAi({ validKey: "test-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "openrouter",
      label: "OpenRouter",
      apiKey: "bad-key",
      baseUrl: openai.url,
      timeoutMs: 3000,
      missingKeyName: "OPENROUTER_API_KEY",
    });
    let error: unknown;
    try {
      await collect(adapter.stream({ model: "any", messages }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ status: 401, code: "provider_http_error" });
    expect((error as Error).message).toMatch(/invalid api key/i);
    expect((error as Error).message).not.toContain("bad-key");
  });

  it("flags rate limits and upstream failures as retryable", async () => {
    openai = await startFakeOpenAi({ validKey: "test-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      apiKey: "test-key",
      baseUrl: openai.url,
      timeoutMs: 3000,
      missingKeyName: "GROQ_API_KEY",
    });

    await expect(collect(adapter.stream({ model: "rate-limit", messages }))).rejects.toMatchObject({
      status: 429,
      retryable: true,
    });
    await expect(collect(adapter.stream({ model: "error-500", messages }))).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });
  });

  it("times out stalled requests", async () => {
    openai = await startFakeOpenAi({ validKey: "test-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      apiKey: "test-key",
      baseUrl: openai.url,
      timeoutMs: 100,
      missingKeyName: "GROQ_API_KEY",
    });
    await expect(collect(adapter.stream({ model: "slow-timeout", messages }))).rejects.toThrow(
      /timed out|aborted/i,
    );
  });

  it("adds OpenRouter attribution headers", async () => {
    openai = await startFakeOpenAi({ validKey: "openrouter-key" });
    const adapter = createOpenAiCompatibleAdapter({
      id: "openrouter",
      label: "OpenRouter",
      apiKey: "openrouter-key",
      baseUrl: openai.url,
      timeoutMs: 3000,
      missingKeyName: "OPENROUTER_API_KEY",
      extraHeaders: { "HTTP-Referer": "https://jarvis.test", "X-Title": "JARVIS" },
    });
    await collect(adapter.stream({ model: "any", messages }));
    const headers = openai.requests[0].headers;
    expect(headers["http-referer"]).toBe("https://jarvis.test");
    expect(headers["x-title"]).toBe("JARVIS");
  });

  it("fails closed when no API key is configured", async () => {
    const adapter = createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 1000,
      missingKeyName: "GROQ_API_KEY",
    });
    expect(adapter.isConfigured()).toBe(false);
    await expect(collect(adapter.stream({ model: "any", messages }))).rejects.toMatchObject({
      code: "provider_not_configured",
    });
  });
});

describe("Gemini provider", () => {
  it("builds Gemini-compatible requests with tools and tool results", () => {
    const request = buildGeminiRequest({
      model: "gemini-test",
      messages: [
        { role: "system", content: "System rules" },
        { role: "user", content: "What time is it?" },
        {
          role: "assistant",
          content: "",
          toolCalls: [{ id: "call_1", name: "current_time", arguments: { timezone: "UTC" } }],
        },
        { role: "tool", content: '{"iso":"now"}', toolCallId: "call_1", toolName: "current_time" },
      ],
      tools: [
        {
          name: "current_time",
          description: "Clock",
          parameters: {
            type: "object",
            properties: { timezone: { type: "string" } },
            additionalProperties: false,
          },
          category: "utility",
          sensitivity: "safe",
          execute: async () => ({ content: "" }),
        },
      ],
      temperature: 0.4,
    });

    expect(request.systemInstruction?.parts[0].text).toBe("System rules");
    expect(request.contents[0]).toMatchObject({ role: "user", parts: [{ text: "What time is it?" }] });
    expect(request.contents[1].parts[0].functionCall).toMatchObject({
      name: "current_time",
      args: { timezone: "UTC" },
    });
    expect(request.contents[2].parts[0].functionResponse).toMatchObject({ name: "current_time" });
    expect(JSON.stringify(request.tools)).not.toContain("additionalProperties");
    expect(request.generationConfig).toMatchObject({ temperature: 0.4 });
  });

  it("streams Gemini text and function calls with server-side auth", async () => {
    let capturedUrl = "";
    let capturedKey: string | undefined;
    const body = [
      'data: {"candidates":[{"content":{"parts":[{"text":"Gemini "}]},"finishReason":null}]}',
      'data: {"candidates":[{"content":{"parts":[{"text":"online."}]},"finishReason":null}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = input instanceof Request ? input.url : String(input);
      capturedKey = (init?.headers as Record<string, string> | undefined)?.["x-goog-api-key"];
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    });

    const adapter = createGeminiAdapter({ apiKey: "gemini-test-key", timeoutMs: 3000 });
    const events = await collect(adapter.stream({ model: "gemini-3.8-flash", messages }));
    expect(textOf(events)).toBe("Gemini online.");
    expect(events.some((event) => event.type === "usage")).toBe(true);
    expect(capturedUrl).toContain("gemini-3.8-flash:streamGenerateContent?alt=sse");
    expect(capturedKey).toBe("gemini-test-key");
    expect(JSON.stringify(events)).not.toContain("gemini-test-key");
  });

  it("parses CRLF-delimited Gemini SSE frames split across chunks", async () => {
    const body = [
      'data: {"candidates":[{"content":{"parts":[{"text":"OK"}]},"index":0}],"usageMetadata":{"promptTokenCount":6,"candidatesTokenCount":1}}',
      'data: {"candidates":[{"content":{"parts":[{"text":"","thoughtSignature":"abc"}]},"finishReason":"STOP","index":0}]}',
      "data: [DONE]",
      "",
    ].join("\r\n\r\n");
    const bytes = new TextEncoder().encode(body);
    const cut = body.indexOf("\r\n\r\n") + 1; // split inside a CRLF pair
    const split = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, cut));
        controller.enqueue(bytes.slice(cut, cut + 3));
        controller.enqueue(bytes.slice(cut + 3));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", async () => new Response(split, { status: 200 }));
    const adapter = createGeminiAdapter({ apiKey: "key", timeoutMs: 3000 });
    const events = await collect(adapter.stream({ model: "gemini-3.6-flash", messages }));
    expect(textOf(events)).toBe("OK");
    expect(events.find((event) => event.type === "done")).toMatchObject({
      finishReason: "STOP",
    });
  });

  it("parses Gemini function calls", async () => {
    const body = [
      'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"calculator","args":{"expression":"6*7"}}}]},"finishReason":"STOP"}]}',
      "data: [DONE]",
      "",
    ].join("\n\n");
    vi.stubGlobal("fetch", async () => new Response(body, { status: 200 }));
    const adapter = createGeminiAdapter({ apiKey: "key", timeoutMs: 3000 });
    const events = await collect(adapter.stream({ model: "m", messages }));
    expect(events.find((event) => event.type === "tool_call")).toMatchObject({
      call: { name: "calculator", arguments: { expression: "6*7" } },
    });
  });

  it("surfaces a provider 404 with the upstream model message", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            error: { message: "This model models/retired-flash is no longer available." },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        ),
    );
    const adapter = createGeminiAdapter({ apiKey: "key", timeoutMs: 3000 });
    await expect(collect(adapter.stream({ model: "retired-flash", messages }))).rejects.toMatchObject({
      status: 404,
      code: "provider_http_error",
      retryable: false,
    });
    await expect(collect(adapter.stream({ model: "retired-flash", messages }))).rejects.toThrow(
      /no longer available/,
    );
  });

  it("reports invalid keys and safety blocks", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ error: { message: "API key not valid" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const adapter = createGeminiAdapter({ apiKey: "invalid-key", timeoutMs: 3000 });
    await expect(collect(adapter.stream({ model: "m", messages }))).rejects.toMatchObject({
      status: 401,
      code: "provider_http_error",
    });

    vi.unstubAllGlobals();
    const safety = 'data: {"candidates":[{"content":{"parts":[]},"finishReason":"SAFETY"}]}\n\n';
    vi.stubGlobal("fetch", async () => new Response(safety, { status: 200 }));
    const safetyAdapter = createGeminiAdapter({ apiKey: "key", timeoutMs: 3000 });
    await expect(collect(safetyAdapter.stream({ model: "m", messages }))).rejects.toMatchObject({
      code: "content_filtered",
    });
  });

  it("fails closed without a key", async () => {
    const adapter = createGeminiAdapter({ timeoutMs: 1000 });
    expect(adapter.isConfigured()).toBe(false);
    await expect(collect(adapter.stream({ model: "m", messages }))).rejects.toMatchObject({
      code: "provider_not_configured",
    });
  });
});

describe("Ollama provider against the deterministic fake server", () => {
  it("lists local models", async () => {
    ollama = await startFakeOllama();
    const adapter = createOllamaAdapter({ baseUrl: ollama.url, timeoutMs: 3000 });
    const models = await adapter.listModels?.();
    expect(models?.map((model) => model.model)).toEqual(
      expect.arrayContaining(["fake-chat", "fake-tool", "fake-error"]),
    );
  });

  it("streams text, usage, and tool calls", async () => {
    ollama = await startFakeOllama();
    const adapter = createOllamaAdapter({ baseUrl: ollama.url, timeoutMs: 3000 });
    const events = await collect(adapter.stream({ model: "fake-chat", messages }));
    expect(textOf(events)).toBe("Hello from fake Ollama.");
    expect(events.some((event) => event.type === "usage")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });

    const toolEvents = await collect(adapter.stream({ model: "fake-tool", messages }));
    expect(toolEvents.find((event) => event.type === "tool_call")).toMatchObject({
      call: { name: "file_write" },
    });
  });

  it("surfaces HTTP failures and unreachable endpoints", async () => {
    ollama = await startFakeOllama();
    const adapter = createOllamaAdapter({ baseUrl: ollama.url, timeoutMs: 3000 });
    await expect(collect(adapter.stream({ model: "fake-error", messages }))).rejects.toMatchObject({
      status: 500,
      retryable: true,
    });

    const offline = createOllamaAdapter({ baseUrl: "http://127.0.0.1:1", timeoutMs: 500 });
    await expect(collect(offline.stream({ model: "fake-chat", messages }))).rejects.toMatchObject({
      code: "provider_unreachable",
    });
  });

  it("times out stalled streams", async () => {
    ollama = await startFakeOllama();
    const adapter = createOllamaAdapter({ baseUrl: ollama.url, timeoutMs: 100 });
    await expect(collect(adapter.stream({ model: "fake-timeout", messages }))).rejects.toThrow(
      /timed out|aborted/i,
    );
  });
});

describe("provider registry and status", () => {
    it("resolves configured, known, and dynamic Ollama models", async () => {
      ollama = await startFakeOllama();
    const config = createTestConfig(ollama.url, {
      geminiApiKey: "key",
      groqApiKey: "key",
      openRouterApiKey: "key",
    });
    const registry = createProviderRegistry(config);

    expect(resolveModel("gemini:gemini-3.8-flash", registry).info.free).toBe(true);
    expect(resolveModel("gemini:gemini-2.0-flash", registry).info.id).toBe(
      "gemini:gemini-3.6-flash",
    );
    expect(resolveModel("gemini:models/gemini-3.8-flash", registry).info.id).toBe(
      "gemini:gemini-3.8-flash",
    );
    expect(resolveModel("gemini:future-flash-model", registry)).toMatchObject({
      provider: "gemini",
      info: { id: "gemini:future-flash-model", free: false },
    });
    expect(resolveModel("groq:llama-3.3-70b-versatile", registry).provider).toBe("groq");
    expect(resolveModel("openrouter:deepseek/deepseek-chat-v3-0324:free", registry).provider).toBe(
      "openrouter",
    );
    expect(resolveModel("ollama:any-local-model", registry).info.supportsTools).toBe(true);
    expect(() => resolveModel("ollama", registry)).toThrow(/Expected/);
    expect(() => resolveModel("unknown:model", registry)).toThrow(/Unknown provider/);
    expect(() => resolveModel("gemini:bad model", registry)).toThrow(/Invalid model name/);
    expect(() => resolveModel("groq:not-in-catalog", registry)).toThrow(/not in the catalog/);
  });

  it("rejects unconfigured providers and reports accurate status", async () => {
    ollama = await startFakeOllama();
    const config = createTestConfig(ollama.url);
    const registry = createProviderRegistry(config);
    expect(() => resolveModel("groq:llama-3.3-70b-versatile", registry)).toThrow(
      /GROQ_API_KEY is not set/,
    );

    const statuses = await getProviderStatuses(config, registry);
    expect(statuses.find((status) => status.id === "gemini")?.configured).toBe(false);
    expect(statuses.find((status) => status.id === "groq")?.configured).toBe(false);
    expect(statuses.find((status) => status.id === "openrouter")?.configured).toBe(false);
    expect(statuses.find((status) => status.id === "ollama")?.reachable).toBe(true);
  });

  it("merges catalog models with discovered Ollama models", async () => {
    ollama = await startFakeOllama();
    const registry = createProviderRegistry(createTestConfig(ollama.url));
    const models = await listAllModels(registry);
    expect(models.some((model) => model.id === "gemini:gemini-3.8-flash")).toBe(true);
    expect(models.some((model) => model.id === "ollama:fake-chat")).toBe(true);
  });

  it("keeps a selected custom model visible in the catalogue", async () => {
    ollama = await startFakeOllama();
    const registry = createProviderRegistry(createTestConfig(ollama.url));
    const models = await listAllModels(registry, true, "gemini:gemini-3.9-flash-experimental");
    expect(models.some((model) => model.id === "gemini:gemini-3.9-flash-experimental")).toBe(true);
  });
});
