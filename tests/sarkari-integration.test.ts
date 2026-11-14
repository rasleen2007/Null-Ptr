import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";
import { collectEvents, setupHarness, type TestHarnessContext } from "./helpers/harness";
import { getSecretMap, resetVaultForTests, unlockVault } from "@/sarkari/vault";

const PASSPHRASE = "correct horse battery staple";
const AADHAAR = "999941057058";

let fake: FakeOllama;
let ctx: TestHarnessContext | undefined;
let vaultDir: string;

beforeEach(async () => {
  fake = await startFakeOllama();
  vaultDir = await mkdtemp(path.join(os.tmpdir(), "sarkari-integration-"));
  process.env.JARVIS_VAULT_FILE = path.join(vaultDir, "vault.enc.json");
  resetVaultForTests();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  resetVaultForTests();
  delete process.env.JARVIS_VAULT_FILE;
  await rm(vaultDir, { recursive: true, force: true });
  await ctx?.cleanup();
  ctx = undefined;
  await fake.close();
});

describe("privacy ingress through the harness", () => {
  it("stores and sends placeholders, never the real identifier", async () => {
    ctx = await setupHarness(fake.url);
    await unlockVault(PASSPHRASE);

    const source = await ctx.harness.startChat({
      message: `Mera Aadhaar ${AADHAAR} hai, RTI file karni hai`,
      model: "ollama:fake-chat",
    });
    const events = await collectEvents(source);

    const privacy = events.find(
      (event): event is Extract<(typeof events)[number], { type: "privacy" }> =>
        event.type === "privacy",
    );
    expect(privacy).toMatchObject({
      redacted: true,
      placeholders: ["{{AADHAAR_1}}"],
      types: ["aadhaar"],
      route: "cloud",
      verifiedClean: true,
    });

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages[0].content).toBe("Mera Aadhaar {{AADHAAR_1}} hai, RTI file karni hai");

    const conversation = await ctx.store.getConversation(source.conversationId);
    expect(conversation?.title).toContain("{{AADHAAR_1}}");
    expect(conversation?.title).not.toContain(AADHAAR);

    const run = await ctx.store.getRun(source.runId);
    expect(run?.input).toContain("{{AADHAAR_1}}");
    expect(run?.input).not.toContain(AADHAAR);
    expect(run?.state.privacy).toMatchObject({
      redacted: true,
      placeholders: ["{{AADHAAR_1}}"],
    });

    const stored = JSON.stringify(await ctx.store.listConversations());
    const rawDb = await readFile(ctx.dataFile, "utf8");
    expect(stored).not.toContain(AADHAAR);
    expect(rawDb).not.toContain(AADHAAR);

    const request = fake.chatRequests()[0];
    expect(JSON.stringify(request.body)).not.toContain(AADHAAR);
    expect(JSON.stringify(request.body)).toContain("{{AADHAAR_1}}");

    expect(getSecretMap().get("{{AADHAAR_1}}")).toBe(AADHAAR);
  });

  it("rejects the turn without saving anything when the vault is locked", async () => {
    ctx = await setupHarness(fake.url);

    await expect(
      ctx.harness.startChat({
        message: `My Aadhaar is ${AADHAAR}`,
        model: "ollama:fake-chat",
      }),
    ).rejects.toMatchObject({ code: "vault_locked", status: 423 });

    expect(await ctx.store.listConversations()).toHaveLength(0);
    expect(await ctx.store.listMessages("conv_missing")).toHaveLength(0);
    expect(await ctx.store.listRuns()).toHaveLength(0);
    expect(fake.chatRequests()).toHaveLength(0);

    const rawDb = await readFile(ctx.dataFile, "utf8").catch(() => "");
    expect(rawDb).not.toContain(AADHAAR);
  });

  it("allows non-personal messages while the vault is locked", async () => {
    ctx = await setupHarness(fake.url);

    const source = await ctx.harness.startChat({
      message: "What documents do I need for PM-KISAN?",
      model: "ollama:fake-chat",
    });
    const events = await collectEvents(source);
    expect(events.some((event) => event.type === "privacy")).toBe(true);

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages[0].content).toBe("What documents do I need for PM-KISAN?");
  });
});
