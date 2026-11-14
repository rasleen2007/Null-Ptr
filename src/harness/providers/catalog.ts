import type { ModelInfo, ProviderId } from "../types";

/**
 * Default route for new conversations. Gemini 3.6 Flash is a stable Flash
 * model listed with free-tier input/output on Google's pricing page and was
 * verified with a live request on 2026-11-11. Gemini 3.8 Flash is newer but was
 * returning capacity 503s during verification, so it remains selectable but is
 * not the default. Keep this in sync with README.md and .env.example.
 */
export const DEFAULT_MODEL_ID = "gemini:gemini-3.6-flash";

/**
 * Models that Google has shut down or limited to existing users. Stored
 * settings and conversations may still reference them, so resolve them to a
 * currently supported replacement instead of failing with a provider 404.
 * Source: https://ai.google.dev/gemini-api/docs/models (checked 2026-11-11).
 */
export const RETIRED_MODEL_REPLACEMENTS: Record<string, string> = {
  "gemini:gemini-2.0-flash": "gemini:gemini-3.6-flash",
  "gemini:gemini-2.0-flash-lite": "gemini:gemini-3.5-flash-lite",
  "gemini:gemini-2.5-flash": "gemini:gemini-3.5-flash-lite",
  "gemini:gemini-2.5-pro": "gemini:gemini-3.6-flash",
};

export const MODEL_CATALOG: ModelInfo[] = [
  {
    id: "gemini:gemini-3.8-flash",
    provider: "gemini",
    model: "gemini-3.8-flash",
    label: "Gemini 3.8 Flash",
    description:
      "Google's newest Flash model for agentic work. Free tier available, but capacity can be constrained.",
    contextWindow: 1_000_000,
    supportsTools: true,
    free: true,
    tags: ["agentic", "tools", "1M context"],
  },
  {
    id: "gemini:gemini-3.6-flash",
    provider: "gemini",
    model: "gemini-3.6-flash",
    label: "Gemini 3.6 Flash",
    description: "Stable Flash model with free-tier access. Verified working on 2026-11-11.",
    contextWindow: 1_000_000,
    supportsTools: true,
    free: true,
    tags: ["fast", "tools", "1M context"],
  },
  {
    id: "gemini:gemini-3.5-flash-lite",
    provider: "gemini",
    model: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash-Lite",
    description: "Fastest, most cost-efficient 3.5 model. Free tier available.",
    contextWindow: 1_000_000,
    supportsTools: true,
    free: true,
    tags: ["fast", "cheap", "tools"],
  },
  {
    id: "gemini:gemini-3.1-flash-lite",
    provider: "gemini",
    model: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    description: "High-throughput Gemini Flash-Lite model. Free tier available.",
    contextWindow: 1_000_000,
    supportsTools: true,
    free: true,
    tags: ["fast", "cheap", "tools"],
  },
  {
    id: "groq:llama-3.3-70b-versatile",
    provider: "groq",
    model: "llama-3.3-70b-versatile",
    label: "Llama 3.3 70B",
    description: "Meta's 70B model served by Groq with very high throughput.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["fast", "tools", "70B"],
  },
  {
    id: "groq:llama-3.1-8b-instant",
    provider: "groq",
    model: "llama-3.1-8b-instant",
    label: "Llama 3.1 8B Instant",
    description: "Tiny and extremely fast. Good for quick utility tasks.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["instant", "tools", "8B"],
  },
  {
    id: "groq:openai/gpt-oss-120b",
    provider: "groq",
    model: "openai/gpt-oss-120b",
    label: "GPT-OSS 120B",
    description: "Open-weight 120B model with strong reasoning and tool calling.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["open weights", "reasoning", "tools"],
  },
  {
    id: "groq:openai/gpt-oss-20b",
    provider: "groq",
    model: "openai/gpt-oss-20b",
    label: "GPT-OSS 20B",
    description: "Compact open-weight model, fast and tool-capable.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["open weights", "fast", "tools"],
  },
  {
    id: "groq:qwen/qwen3-32b",
    provider: "groq",
    model: "qwen/qwen3-32b",
    label: "Qwen 3 32B",
    description: "Alibaba Qwen 3 with multilingual reasoning and tool support.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["multilingual", "reasoning", "tools"],
  },
  {
    id: "openrouter:deepseek/deepseek-chat-v3-0324:free",
    provider: "openrouter",
    model: "deepseek/deepseek-chat-v3-0324:free",
    label: "DeepSeek V3 (free)",
    description: "Strong open-weight chat model through OpenRouter's free tier.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["openrouter", "free", "tools"],
  },
  {
    id: "openrouter:meta-llama/llama-3.3-70b-instruct:free",
    provider: "openrouter",
    model: "meta-llama/llama-3.3-70b-instruct:free",
    label: "Llama 3.3 70B (free)",
    description: "Free OpenRouter route to Meta Llama 3.3 70B Instruct.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["openrouter", "free", "tools"],
  },
  {
    id: "openrouter:qwen/qwen3-coder:free",
    provider: "openrouter",
    model: "qwen/qwen3-coder:free",
    label: "Qwen 3 Coder (free)",
    description: "Code-focused Qwen model via OpenRouter free tier.",
    contextWindow: 262_000,
    supportsTools: true,
    free: true,
    tags: ["openrouter", "free", "code"],
  },
  {
    id: "openrouter:mistralai/mistral-small-3.2-24b-instruct:free",
    provider: "openrouter",
    model: "mistralai/mistral-small-3.2-24b-instruct:free",
    label: "Mistral Small 3.2 (free)",
    description: "Efficient Mistral model with tool calling, free on OpenRouter.",
    contextWindow: 128_000,
    supportsTools: true,
    free: true,
    tags: ["openrouter", "free", "tools"],
  },
  {
    id: "openrouter:google/gemma-3-27b-it:free",
    provider: "openrouter",
    model: "google/gemma-3-27b-it:free",
    label: "Gemma 3 27B (free)",
    description: "Google Gemma 3 via OpenRouter free tier. Chat only.",
    contextWindow: 96_000,
    supportsTools: false,
    free: true,
    tags: ["openrouter", "free", "chat"],
  },
  {
    id: "openrouter:deepseek/deepseek-r1:free",
    provider: "openrouter",
    model: "deepseek/deepseek-r1:free",
    label: "DeepSeek R1 (free)",
    description: "Open reasoning model. Long chain-of-thought, no tool calls.",
    contextWindow: 128_000,
    supportsTools: false,
    free: true,
    tags: ["openrouter", "free", "reasoning"],
  },
];

export const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Google Gemini",
  groq: "Groq",
  openrouter: "OpenRouter",
  ollama: "Ollama (local)",
};

export const PROVIDER_DOCS: Record<string, string> = {
  gemini: "https://aistudio.google.com/app/apikey",
  groq: "https://console.groq.com/keys",
  openrouter: "https://openrouter.ai/keys",
  ollama: "https://ollama.com/download",
};

export function findCatalogModel(id: string): ModelInfo | undefined {
  return MODEL_CATALOG.find((m) => m.id === id);
}

export function parseModelId(id: string): { provider: string; model: string } | null {
  const index = id.indexOf(":");
  if (index <= 0 || index === id.length - 1) return null;
  return { provider: id.slice(0, index), model: id.slice(index + 1) };
}

/**
 * Trims a model id, strips a pasted "models/" prefix from Gemini names, and
 * maps retired Gemini models to their current replacement.
 */
export function normalizeModelId(id: string): string {
  const trimmed = id.trim();
  const parsed = parseModelId(trimmed);
  if (!parsed) return trimmed;
  const model = parsed.provider === "gemini" ? parsed.model.replace(/^models\//, "") : parsed.model;
  const normalized = `${parsed.provider}:${model}`;
  return RETIRED_MODEL_REPLACEMENTS[normalized] ?? normalized;
}

/** Rejects empty names and whitespace/control characters before a provider call. */
export function isValidModelName(model: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(model);
}

export function supportsCustomModels(provider: ProviderId): boolean {
  return provider === "gemini" || provider === "ollama";
}

export function createCustomModelInfo(provider: ProviderId, model: string): ModelInfo {
  if (provider === "ollama") {
    return {
      id: `ollama:${model}`,
      provider,
      model,
      label: model,
      description: "Local Ollama model. Ensure it is pulled with `ollama pull`.",
      contextWindow: 8192,
      supportsTools: true,
      free: true,
      tags: ["local", "private"],
    };
  }
  return {
    id: `gemini:${model}`,
    provider,
    model,
    label: model,
    description:
      "Custom Gemini model ID. Availability and free-tier access depend on your Google account.",
    contextWindow: 1_000_000,
    supportsTools: true,
    free: false,
    tags: ["custom"],
  };
}

/**
 * Builds display/route metadata for any model id the app can represent. Used
 * to keep a custom selected model visible in the picker even though it is not
 * in the catalogue.
 */
export function describeModelId(id: string): ModelInfo | null {
  const normalized = normalizeModelId(id);
  const parsed = parseModelId(normalized);
  if (!parsed) return null;
  const known = findCatalogModel(normalized);
  if (known) return known;
  if (!(parsed.provider in PROVIDER_LABELS)) return null;
  const provider = parsed.provider as ProviderId;
  if (!supportsCustomModels(provider)) return null;
  if (!isValidModelName(parsed.model)) return null;
  return createCustomModelInfo(provider, parsed.model);
}
