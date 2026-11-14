import type {
  ProviderAdapter,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
} from "../types";
import { ProviderError } from "../errors";
import { createId, normalizeToolCall } from "../utils";
import { createTimeoutSignal, iterateSse } from "./transport";

interface OpenAiToolCallPart {
  index?: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface OpenAiChunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: OpenAiToolCallPart[];
    };
    finish_reason?: string | null;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; code?: string | number; type?: string };
}

interface AccumulatedCall {
  id?: string;
  name: string;
  args: string;
}

function toOpenAiMessages(messages: ProviderMessage[]): unknown[] {
  return messages
    .filter((m) => m.role !== "tool" || m.toolCallId)
    .map((message) => {
      if (message.role === "assistant") {
        if (message.toolCalls?.length) {
          return {
            role: "assistant",
            content: message.content || null,
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: "function",
              function: { name: call.name, arguments: JSON.stringify(call.arguments ?? {}) },
            })),
          };
        }
        return { role: "assistant", content: message.content };
      }
      if (message.role === "tool") {
        return {
          role: "tool",
          tool_call_id: message.toolCallId,
          content: message.content,
        };
      }
      return { role: message.role, content: message.content };
    });
}

export function createOpenAiCompatibleAdapter(options: {
  id: "groq" | "openrouter";
  label: string;
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
  extraHeaders?: Record<string, string>;
  missingKeyName: string;
}): ProviderAdapter {
  return {
    id: options.id,
    label: options.label,
    isConfigured: () => Boolean(options.apiKey),
    missingReason: () => (options.apiKey ? undefined : `${options.missingKeyName} is not set`),

    async *stream(req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      if (!options.apiKey) {
        throw new ProviderError(`${options.label} is not configured. Set ${options.missingKeyName}.`, {
          code: "provider_not_configured",
        });
      }
      const timeout = createTimeoutSignal(req.signal, options.timeoutMs);
      try {
        const payload: Record<string, unknown> = {
          model: req.model,
          messages: toOpenAiMessages(req.messages),
          stream: true,
        };
        if (typeof req.temperature === "number") payload.temperature = req.temperature;
        if (typeof req.maxTokens === "number") payload.max_tokens = req.maxTokens;
        if (req.tools?.length) {
          payload.tools = req.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }));
          payload.tool_choice = "auto";
        }

        const response = await fetch(`${options.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${options.apiKey}`,
            ...(options.extraHeaders ?? {}),
          },
          body: JSON.stringify(payload),
          signal: timeout.signal,
        });

        if (!response.ok || !response.body) {
          const raw = await response.text().catch(() => "");
          throw new ProviderError(
            `${options.label} request failed (${response.status}): ${extractErrorMessage(raw)}`,
            {
              code: "provider_http_error",
              status: response.status,
              retryable: response.status === 429 || response.status >= 500,
            },
          );
        }

        const pending = new Map<number, AccumulatedCall>();
        let finishReason: string | undefined;

        for await (const line of iterateSse(response.body)) {
          if (line.data === "[DONE]") break;
          let chunk: OpenAiChunk;
          try {
            chunk = JSON.parse(line.data) as OpenAiChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            throw new ProviderError(`${options.label} error: ${chunk.error.message ?? "unknown"}`, {
              code: "provider_http_error",
              retryable: true,
            });
          }
          const choice = chunk.choices?.[0];
          if (choice?.delta?.content) {
            yield { type: "text", delta: choice.delta.content };
          }
          if (choice?.delta?.tool_calls) {
            for (const part of choice.delta.tool_calls) {
              const index = part.index ?? 0;
              const current = pending.get(index) ?? { name: "", args: "" };
              if (part.id) current.id = part.id;
              if (part.function?.name) current.name = part.function.name;
              if (part.function?.arguments) current.args += part.function.arguments;
              pending.set(index, current);
            }
          }
          if (choice?.finish_reason) finishReason = choice.finish_reason;
          if (chunk.usage) {
            yield {
              type: "usage",
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
            };
          }
        }

        const indices = [...pending.keys()].sort((a, b) => a - b);
        for (const index of indices) {
          const call = pending.get(index);
          if (!call?.name) continue;
          let args: unknown = {};
          try {
            args = call.args ? JSON.parse(call.args) : {};
          } catch {
            args = {};
          }
          yield {
            type: "tool_call",
            call: normalizeToolCall({
              id: call.id || createId("call"),
              name: call.name,
              arguments: args,
            }),
          };
        }

        yield { type: "done", finishReason };
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as Error).name === "AbortError") {
          throw new ProviderError(`${options.label} request was cancelled or timed out.`, {
            code: "provider_aborted",
          });
        }
        throw new ProviderError(`${options.label} request failed: ${(error as Error).message}`, {
          retryable: true,
        });
      } finally {
        timeout.cleanup();
      }
    },
  };
}

function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } };
    return parsed.error?.message ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300) || "no response body";
  }
}
