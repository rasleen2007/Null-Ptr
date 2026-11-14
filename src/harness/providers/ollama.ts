import type {
  ModelInfo,
  ProviderAdapter,
  ProviderEvent,
  ProviderMessage,
  ProviderRequest,
} from "../types";
import { ProviderError } from "../errors";
import { createId, normalizeToolCall, parseToolArguments } from "../utils";
import { createTimeoutSignal, iterateJsonLines } from "./transport";

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
  tool_name?: string;
}

interface OllamaChunk {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

export function toOllamaMessages(messages: ProviderMessage[]): OllamaMessage[] {
  return messages.map((message: ProviderMessage) => {
    if (message.role === "assistant" && message.toolCalls?.length) {
      return {
        role: "assistant",
        content: message.content || "",
        tool_calls: message.toolCalls.map((call) => ({
          id: call.id,
          function: { name: call.name, arguments: call.arguments },
        })),
      };
    }
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_name: message.toolName,
      };
    }
    return { role: message.role as OllamaMessage["role"], content: message.content };
  });
}

export function createOllamaAdapter(options: {
  baseUrl: string;
  timeoutMs: number;
}): ProviderAdapter {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");

  return {
    id: "ollama",
    label: "Ollama (local)",
    isConfigured: () => true,
    missingReason: () =>
      `Ollama is expected at ${baseUrl}. Install Ollama and run "ollama serve" for local inference.`,

    async listModels(): Promise<ModelInfo[]> {
      const timeout = createTimeoutSignal(undefined, 2500);
      try {
        const response = await fetch(`${baseUrl}/api/tags`, { signal: timeout.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as {
          models?: { name: string; size?: number; details?: { parameter_size?: string; family?: string } }[];
        };
        return (data.models ?? [])
          .map((model) => ({
            id: `ollama:${model.name}`,
            provider: "ollama" as const,
            model: model.name,
            label: model.name,
            description: `Local Ollama model${model.details?.parameter_size ? ` (${model.details.parameter_size})` : ""}. Runs on your machine — no API key, no per-token cost.`,
            contextWindow: 8192,
            supportsTools: true,
            free: true,
            tags: ["local", "private", ...(model.details?.parameter_size ? [model.details.parameter_size] : [])],
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
      } finally {
        timeout.cleanup();
      }
    },

    async *stream(req: ProviderRequest): AsyncGenerator<ProviderEvent> {
      const timeout = createTimeoutSignal(req.signal, options.timeoutMs);
      try {
        const payload: Record<string, unknown> = {
          model: req.model,
          messages: toOllamaMessages(req.messages),
          stream: true,
        };
        const modelOptions: Record<string, unknown> = {};
        if (typeof req.temperature === "number") modelOptions.temperature = req.temperature;
        if (typeof req.maxTokens === "number") modelOptions.num_predict = req.maxTokens;
        if (Object.keys(modelOptions).length) payload.options = modelOptions;
        if (req.tools?.length) {
          payload.tools = req.tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }));
        }

        let response: Response;
        try {
          response = await fetch(`${baseUrl}/api/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: timeout.signal,
          });
        } catch (error) {
          if ((error as Error).name === "AbortError") throw error;
          throw new ProviderError(
            `Could not reach Ollama at ${baseUrl}. Is "ollama serve" running? (${(error as Error).message})`,
            { code: "provider_unreachable", retryable: false },
          );
        }

        if (!response.ok || !response.body) {
          const raw = await response.text().catch(() => "");
          throw new ProviderError(
            `Ollama request failed (${response.status}): ${extractErrorMessage(raw)}`,
            {
              code: "provider_http_error",
              status: response.status,
              retryable: response.status >= 500,
            },
          );
        }

        for await (const line of iterateJsonLines(response.body)) {
          let chunk: OllamaChunk;
          try {
            chunk = JSON.parse(line) as OllamaChunk;
          } catch {
            continue;
          }
          if (chunk.error) {
            throw new ProviderError(`Ollama error: ${chunk.error}`, { code: "provider_http_error" });
          }
          if (chunk.message?.content) {
            yield { type: "text", delta: chunk.message.content };
          }
          for (const toolCall of chunk.message?.tool_calls ?? []) {
            if (!toolCall.function?.name) continue;
            yield {
              type: "tool_call",
              call: normalizeToolCall({
                id: toolCall.id || createId("call"),
                name: toolCall.function.name,
                arguments: parseToolArguments(toolCall.function.arguments),
              }),
            };
          }
          if (chunk.prompt_eval_count || chunk.eval_count) {
            yield {
              type: "usage",
              promptTokens: chunk.prompt_eval_count,
              completionTokens: chunk.eval_count,
            };
          }
          if (chunk.done) {
            yield { type: "done", finishReason: chunk.done_reason ?? "stop" };
            break;
          }
        }
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        if ((error as Error).name === "AbortError") {
          throw new ProviderError("Ollama request was cancelled or timed out.", {
            code: "provider_aborted",
          });
        }
        throw new ProviderError(`Ollama request failed: ${(error as Error).message}`);
      } finally {
        timeout.cleanup();
      }
    },
  };
}

function extractErrorMessage(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300) || "no response body";
  }
}
