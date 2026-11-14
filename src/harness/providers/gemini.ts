import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
  ToolDefinition,
} from "../types";
import { ProviderError } from "../errors";
import { createId, normalizeToolCall } from "../utils";
import { createTimeoutSignal, iterateSse } from "./transport";

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
  thoughtSignature?: string;
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequest {
  systemInstruction?: { parts: { text: string }[] };
  contents: GeminiContent[];
  tools?: { functionDeclarations: unknown[] }[];
  generationConfig?: Record<string, unknown>;
}

function cleanSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cleanSchema);
  if (!value || typeof value !== "object") return value;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "additionalProperties")
    .map(([key, val]) => [key, cleanSchema(val)]);
  return Object.fromEntries(entries);
}

export function buildGeminiRequest(req: ProviderRequest): GeminiRequest {
  const systems: string[] = [];
  const contents: GeminiContent[] = [];

  const push = (role: GeminiContent["role"], parts: GeminiPart[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };

  for (const message of req.messages) {
    if (message.role === "system") {
      if (message.content.trim()) systems.push(message.content);
      continue;
    }
    if (message.role === "user") {
      push("user", [{ text: message.content }]);
      continue;
    }
    if (message.role === "assistant") {
      const parts: GeminiPart[] = [];
      if (message.content.trim()) parts.push({ text: message.content });
      for (const call of message.toolCalls ?? []) {
        const part: GeminiPart = { functionCall: { name: call.name, args: call.arguments } };
        const signature = call.providerMeta?.thoughtSignature;
        if (typeof signature === "string") part.thoughtSignature = signature;
        parts.push(part);
      }
      push("model", parts);
      continue;
    }
    if (message.role === "tool") {
      push("user", [
        {
          functionResponse: {
            name: message.toolName || "tool",
            response: { result: message.content },
          },
        },
      ]);
    }
  }

  const tools = (req.tools ?? []).map((tool: ToolDefinition) => ({
    functionDeclarations: [
      {
        name: tool.name,
        description: tool.description,
        parameters: cleanSchema(tool.parameters),
      },
    ],
  }));

  const generationConfig: Record<string, unknown> = {};
  if (typeof req.temperature === "number") generationConfig.temperature = req.temperature;
  if (typeof req.maxTokens === "number") generationConfig.maxOutputTokens = req.maxTokens;

  return {
    systemInstruction: systems.length ? { parts: [{ text: systems.join("\n\n") }] } : undefined,
    contents,
    tools: tools.length ? tools : undefined,
    generationConfig: Object.keys(generationConfig).length ? generationConfig : undefined,
  };
}

export function createGeminiAdapter(options: {
  apiKey?: string;
  timeoutMs: number;
}): ProviderAdapter {
  const baseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

  return {
    id: "gemini",
    label: "Google Gemini",
    isConfigured: () => Boolean(options.apiKey),
    missingReason: () => (options.apiKey ? undefined : "GEMINI_API_KEY is not set"),

    async *stream(req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      if (!options.apiKey) {
        throw new ProviderError("Gemini is not configured. Set GEMINI_API_KEY on the server.", {
          code: "provider_not_configured",
        });
      }
      const timeout = createTimeoutSignal(req.signal, options.timeoutMs);
      try {
        const response = await fetch(
          `${baseUrl}/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": options.apiKey,
            },
            body: JSON.stringify(buildGeminiRequest(req)),
            signal: timeout.signal,
          },
        );

        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => "");
          throw new ProviderError(
            `Gemini request failed (${response.status}): ${extractErrorMessage(text)}`,
            {
              code: "provider_http_error",
              status: response.status,
              retryable: response.status === 429 || response.status >= 500,
            },
          );
        }

        for await (const line of iterateSse(response.body)) {
          if (line.data === "[DONE]") break;
          let payload: GeminiStreamChunk;
          try {
            payload = JSON.parse(line.data) as GeminiStreamChunk;
          } catch {
            continue;
          }
          if (payload.error) {
            throw new ProviderError(`Gemini error: ${payload.error.message}`, {
              code: "provider_http_error",
              retryable: payload.error.code === 429 || (payload.error.code ?? 0) >= 500,
            });
          }
          const candidate = payload.candidates?.[0];
          if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
              if (typeof part.text === "string" && part.text.length) {
                yield { type: "text", delta: part.text };
              }
              if (part.functionCall?.name) {
                const call = normalizeToolCall({
                  id: createId("call"),
                  name: part.functionCall.name,
                  arguments: part.functionCall.args,
                });
                if (part.thoughtSignature) {
                  call.providerMeta = { thoughtSignature: part.thoughtSignature };
                }
                yield { type: "tool_call", call };
              }
            }
          }
          if (payload.usageMetadata) {
            yield {
              type: "usage",
              promptTokens: payload.usageMetadata.promptTokenCount,
              completionTokens: payload.usageMetadata.candidatesTokenCount,
            };
          }
          if (candidate?.finishReason) {
            yield { type: "done", finishReason: candidate.finishReason };
          }
          if (candidate?.finishReason === "SAFETY" || candidate?.finishReason === "BLOCKLIST") {
            throw new ProviderError("Gemini blocked the response due to safety filters.", {
              code: "content_filtered",
            });
          }
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as Error).name === "AbortError") {
          throw new ProviderError("Gemini request was cancelled or timed out.", {
            code: "provider_aborted",
          });
        }
        throw new ProviderError(`Gemini request failed: ${(error as Error).message}`, {
          retryable: true,
        });
      } finally {
        timeout.cleanup();
      }
    },
  };
}

interface GeminiStreamChunk {
  candidates?: {
    content?: { parts?: GeminiPart[]; role?: string };
    finishReason?: string;
  }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
  error?: { code?: number; message?: string; status?: string };
}

function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300) || "no response body";
  }
}
