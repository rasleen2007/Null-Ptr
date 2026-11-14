import { describe, expect, it } from "vitest";
import type { ToolDefinition } from "@/harness/types";
import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  PROVIDER_DOCS,
  RETIRED_MODEL_REPLACEMENTS,
  createCustomModelInfo,
  describeModelId,
  findCatalogModel,
  isValidModelName,
  normalizeModelId,
  parseModelId,
} from "@/harness/providers/catalog";
import { DEFAULT_SETTINGS } from "@/harness/config";
import { filterToolsForModel } from "@/harness/providers";

describe("parseModelId", () => {
  it("splits provider and model at the first colon", () => {
    expect(parseModelId("gemini:gemini-3.8-flash")).toEqual({
      provider: "gemini",
      model: "gemini-3.8-flash",
    });
    expect(parseModelId("openrouter:deepseek/deepseek-chat-v3-0324:free")).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-chat-v3-0324:free",
    });
  });

  it("rejects malformed ids", () => {
    expect(parseModelId("gemini")).toBeNull();
    expect(parseModelId(":model")).toBeNull();
    expect(parseModelId("provider:")).toBeNull();
  });
});

describe("model catalog", () => {
  it("contains unique fully-qualified ids", () => {
    const ids = MODEL_CATALOG.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps the model suffix consistent with the id", () => {
    for (const model of MODEL_CATALOG) {
      const parsed = parseModelId(model.id);
      expect(parsed?.provider).toBe(model.provider);
      expect(parsed?.model).toBe(model.model);
    }
  });

  it("finds catalog entries and documents every provider", () => {
    const model = findCatalogModel("gemini:gemini-3.8-flash");
    expect(model?.provider).toBe("gemini");
    expect(findCatalogModel("missing:model")).toBeUndefined();
    for (const provider of ["gemini", "groq", "openrouter", "ollama"]) {
      expect(PROVIDER_DOCS[provider]).toMatch(/^https:\/\//);
    }
  });

  it("defaults to a catalogued, free tier Gemini model", () => {
    expect(DEFAULT_MODEL_ID).toBe("gemini:gemini-3.6-flash");
    expect(DEFAULT_SETTINGS.defaultModel).toBe(DEFAULT_MODEL_ID);
    const model = findCatalogModel(DEFAULT_MODEL_ID);
    expect(model?.provider).toBe("gemini");
    expect(model?.free).toBe(true);
    expect(model?.supportsTools).toBe(true);
  });

  it("does not list shut-down Gemini 2.0 models", () => {
    expect(MODEL_CATALOG.some((model) => model.model.startsWith("gemini-2.0"))).toBe(false);
  });
});

describe("model id normalization", () => {
  it("maps retired Gemini models to supported replacements", () => {
    expect(normalizeModelId("gemini:gemini-2.0-flash")).toBe("gemini:gemini-3.6-flash");
    expect(normalizeModelId("gemini:gemini-2.0-flash-lite")).toBe("gemini:gemini-3.5-flash-lite");
    expect(normalizeModelId(" gemini:gemini-2.5-flash ")).toBe("gemini:gemini-3.5-flash-lite");
    for (const replacement of Object.values(RETIRED_MODEL_REPLACEMENTS)) {
      expect(findCatalogModel(replacement)).toBeDefined();
    }
  });

  it("strips a pasted models/ prefix and keeps other ids stable", () => {
    expect(normalizeModelId("gemini:models/gemini-3.8-flash")).toBe("gemini:gemini-3.8-flash");
    expect(normalizeModelId("gemini:gemini-2.0-flash")).toBe("gemini:gemini-3.6-flash");
    expect(normalizeModelId("ollama:my-model")).toBe("ollama:my-model");
    expect(normalizeModelId("not-a-model")).toBe("not-a-model");
  });

  it("accepts valid custom Gemini names and rejects unsafe ones", () => {
    expect(isValidModelName("gemini-3.8-flash")).toBe(true);
    expect(isValidModelName("tunedModels/my-tune-123")).toBe(true);
    expect(isValidModelName("bad model")).toBe(false);
    expect(isValidModelName("bad\nmodel")).toBe(false);
    expect(isValidModelName("")).toBe(false);

    const custom = describeModelId("gemini:gemini-3.8-flash-preview-01-2027");
    expect(custom).toMatchObject({
      id: "gemini:gemini-3.8-flash-preview-01-2027",
      provider: "gemini",
      supportsTools: true,
      free: false,
    });
    expect(createCustomModelInfo("ollama", "local-x")).toMatchObject({
      id: "ollama:local-x",
      free: true,
    });
    expect(describeModelId("gemini:bad model")).toBeNull();
    expect(describeModelId("unknown:model")).toBeNull();
    expect(describeModelId("gemini")).toBeNull();
  });
});

describe("filterToolsForModel", () => {
  const tools = [{ name: "calculator" }] as ToolDefinition[];
  const baseModel = MODEL_CATALOG[0];

  it("returns tools when enabled and supported", () => {
    expect(filterToolsForModel(tools, baseModel, true)).toBe(tools);
  });

  it("returns no tools when tools are disabled", () => {
    expect(filterToolsForModel(tools, baseModel, false)).toEqual([]);
  });

  it("returns no tools for models without tool support", () => {
    expect(filterToolsForModel(tools, { ...baseModel, supportsTools: false }, true)).toEqual([]);
  });
});
