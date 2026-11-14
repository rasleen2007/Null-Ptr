import type {
  ModelInfo,
  ProviderAdapter,
  ProviderId,
  ProviderStatus,
  ToolDefinition,
} from "../types";
import type { ServerConfig } from "../config";
import {
  MODEL_CATALOG,
  PROVIDER_DOCS,
  PROVIDER_LABELS,
  createCustomModelInfo,
  describeModelId,
  findCatalogModel,
  isValidModelName,
  normalizeModelId,
  parseModelId,
  supportsCustomModels,
} from "./catalog";
import { createGeminiAdapter } from "./gemini";
import { createOllamaAdapter } from "./ollama";
import { createOpenAiCompatibleAdapter } from "./openai-compatible";
import { ProviderError } from "../errors";

export function createProviderRegistry(config: ServerConfig): Record<ProviderId, ProviderAdapter> {
  return {
    gemini: createGeminiAdapter({ apiKey: config.geminiApiKey, timeoutMs: config.providerTimeoutMs }),
    groq: createOpenAiCompatibleAdapter({
      id: "groq",
      label: "Groq",
      apiKey: config.groqApiKey,
      baseUrl: "https://api.groq.com/openai/v1",
      timeoutMs: config.providerTimeoutMs,
      missingKeyName: "GROQ_API_KEY",
    }),
    openrouter: createOpenAiCompatibleAdapter({
      id: "openrouter",
      label: "OpenRouter",
      apiKey: config.openRouterApiKey,
      baseUrl: "https://openrouter.ai/api/v1",
      timeoutMs: config.providerTimeoutMs,
      missingKeyName: "OPENROUTER_API_KEY",
      extraHeaders: {
        "HTTP-Referer": config.openRouterSiteUrl,
        "X-Title": config.openRouterAppName,
      },
    }),
    ollama: createOllamaAdapter({ baseUrl: config.ollamaBaseUrl, timeoutMs: config.providerTimeoutMs }),
  };
}

export interface ResolvedModel {
  info: ModelInfo;
  adapter: ProviderAdapter;
  provider: ProviderId;
}

export function resolveModel(
  modelId: string,
  registry: Record<ProviderId, ProviderAdapter>,
): ResolvedModel {
  const normalizedId = normalizeModelId(modelId);
  const parsed = parseModelId(normalizedId);
  if (!parsed) {
    throw new ProviderError(`Invalid model id "${modelId}". Expected "<provider>:<model>".`, {
      code: "invalid_model",
      status: 400,
    });
  }
  const provider = parsed.provider as ProviderId;
  if (!(provider in registry)) {
    throw new ProviderError(
      `Unknown provider "${provider}". Available: ${Object.keys(registry).join(", ")}.`,
      { code: "invalid_model", status: 400 },
    );
  }
  const adapter = registry[provider];
  if (!adapter.isConfigured()) {
    throw new ProviderError(
      adapter.missingReason?.() ?? `Provider "${provider}" is not configured.`,
      { code: "provider_not_configured", status: 400 },
    );
  }

  const known = findCatalogModel(normalizedId);
  if (known) return { info: known, adapter, provider };

  // Gemini model names change frequently. Allow any syntactically valid model
  // id and let the provider be the source of truth (it returns a clear 404 for
  // unavailable models). Ollama has always supported arbitrary local names.
  if (supportsCustomModels(provider)) {
    if (!isValidModelName(parsed.model)) {
      throw new ProviderError(
        `Invalid model name "${parsed.model}". Model ids may contain letters, digits, ".", "_", "/" and "-".`,
        { code: "invalid_model", status: 400 },
      );
    }
    return { info: createCustomModelInfo(provider, parsed.model), adapter, provider };
  }

  throw new ProviderError(`Model "${normalizedId}" is not in the catalog.`, {
    code: "invalid_model",
    status: 400,
  });
}

export function filterToolsForModel(
  tools: ToolDefinition[],
  model: ModelInfo,
  toolsEnabled: boolean,
): ToolDefinition[] {
  if (!toolsEnabled || !model.supportsTools) return [];
  return tools;
}

export async function listAllModels(
  registry: Record<ProviderId, ProviderAdapter>,
  includeOllama = true,
  selectedModelId?: string,
): Promise<ModelInfo[]> {
  const models = [...MODEL_CATALOG];
  if (includeOllama) {
    try {
      const local = (await registry.ollama.listModels?.()) ?? [];
      models.push(...local);
    } catch {
      // Ollama not running — local models are unavailable, but the app still works.
    }
  }
  // Keep a selected custom model visible in the picker and settings page.
  if (selectedModelId) {
    const normalized = normalizeModelId(selectedModelId);
    if (!models.some((model) => model.id === normalized)) {
      const custom = describeModelId(normalized);
      if (custom) models.push(custom);
    }
  }
  return models;
}

export async function getProviderStatuses(
  config: ServerConfig,
  registry: Record<ProviderId, ProviderAdapter>,
): Promise<ProviderStatus[]> {
  let ollamaReachable = false;
  try {
    await registry.ollama.listModels?.();
    ollamaReachable = true;
  } catch {
    ollamaReachable = false;
  }
  return [
    {
      id: "gemini",
      label: PROVIDER_LABELS.gemini,
      configured: Boolean(config.geminiApiKey),
      reason: config.geminiApiKey ? undefined : "Set GEMINI_API_KEY to enable.",
      local: false,
      docsUrl: PROVIDER_DOCS.gemini,
    },
    {
      id: "groq",
      label: PROVIDER_LABELS.groq,
      configured: Boolean(config.groqApiKey),
      reason: config.groqApiKey ? undefined : "Set GROQ_API_KEY to enable.",
      local: false,
      docsUrl: PROVIDER_DOCS.groq,
    },
    {
      id: "openrouter",
      label: PROVIDER_LABELS.openrouter,
      configured: Boolean(config.openRouterApiKey),
      reason: config.openRouterApiKey ? undefined : "Set OPENROUTER_API_KEY to enable.",
      local: false,
      docsUrl: PROVIDER_DOCS.openrouter,
    },
    {
      id: "ollama",
      label: PROVIDER_LABELS.ollama,
      configured: true,
      reachable: ollamaReachable,
      detail: `Endpoint: ${config.ollamaBaseUrl}`,
      reason: ollamaReachable
        ? undefined
        : `Ollama not reachable at ${config.ollamaBaseUrl}. Run "ollama serve" and pull a model.`,
      local: true,
      docsUrl: PROVIDER_DOCS.ollama,
    },
  ];
}
