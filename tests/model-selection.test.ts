import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";
import { setupHarness, type TestHarnessContext } from "./helpers/harness";

let fake: FakeOllama;
let ctx: TestHarnessContext | undefined;

beforeEach(async () => {
  fake = await startFakeOllama();
});

afterEach(async () => {
  await ctx?.cleanup();
  ctx = undefined;
  await fake.close();
});

describe("Gemini model selection", () => {
  it("persists the default model across a restart", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });

    const saved = await ctx.harness.updateSettings({
      defaultModel: "gemini:gemini-3.9-flash-experimental",
    });
    expect(saved.defaultModel).toBe("gemini:gemini-3.9-flash-experimental");

    const reloaded = await ctx.recreate();
    expect((await reloaded.getSettings()).defaultModel).toBe(
      "gemini:gemini-3.9-flash-experimental",
    );
  });

  it("canonicalizes pasted Gemini model ids before saving", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });

    const saved = await ctx.harness.updateSettings({
      defaultModel: "gemini:models/gemini-3.8-flash",
    });
    expect(saved.defaultModel).toBe("gemini:gemini-3.8-flash");
  });

  it("migrates a retired default stored by an older version", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });
    await ctx.store.updateSettings({ defaultModel: "gemini:gemini-2.0-flash" });

    const settings = await ctx.harness.getSettings();
    expect(settings.defaultModel).toBe("gemini:gemini-3.6-flash");

    // The migration is written back, so a restart does not re-run it.
    const persisted = await ctx.store.getSettings();
    expect(persisted.defaultModel).toBe("gemini:gemini-3.6-flash");
  });

  it("migrates a retired conversation model when the conversation continues", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });
    const conversation = await ctx.store.createConversation({
      title: "Legacy conversation",
      model: "gemini:gemini-2.0-flash",
    });

    const source = await ctx.harness.startChat({
      conversationId: conversation.id,
      message: "Continue after the migration",
    });
    await ctx.harness.cancelRun(source.runId);

    const updated = await ctx.store.getConversation(conversation.id);
    expect(updated?.model).toBe("gemini:gemini-3.6-flash");
  });

  it("keeps the selected custom model in the model list and settings", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });
    const customId = "gemini:gemini-custom-lab-01";

    await ctx.harness.updateSettings({ defaultModel: customId });
    const [models, settings] = await Promise.all([
      ctx.harness.listModels(),
      ctx.harness.getSettings(),
    ]);

    expect(settings.defaultModel).toBe(customId);
    expect(models.find((model) => model.id === customId)).toMatchObject({
      provider: "gemini",
      supportsTools: true,
      free: false,
    });
  });

  it("rejects malformed and unsafe model ids", async () => {
    ctx = await setupHarness(fake.url, { geminiApiKey: "test-key" });

    await expect(ctx.harness.updateSettings({ defaultModel: "gemini" })).rejects.toMatchObject({
      code: "invalid_model",
      status: 400,
    });
    await expect(
      ctx.harness.updateSettings({ defaultModel: "gemini:bad model" }),
    ).rejects.toMatchObject({ code: "invalid_model", status: 400 });
    await expect(
      ctx.harness.updateSettings({ defaultModel: "unknown:some-model" }),
    ).rejects.toMatchObject({ code: "invalid_model", status: 400 });
  });

  it("rejects a custom Gemini model when the provider is not configured", async () => {
    ctx = await setupHarness(fake.url);
    await expect(
      ctx.harness.updateSettings({ defaultModel: "gemini:gemini-3.8-flash" }),
    ).rejects.toMatchObject({ code: "provider_not_configured", status: 400 });
  });
});
