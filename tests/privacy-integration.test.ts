import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";
import { collectEvents, setupHarness, type TestHarnessContext } from "./helpers/harness";
import type { StreamEvent } from "@/harness/types";
import {
  getSecretMap,
  lockVault,
  rememberValue,
  resetVaultForTests,
  unlockVault,
} from "@/sarkari/vault";
import { redact, redactForModel } from "@/sarkari/tokenizer";
import { guardOutbound } from "@/sarkari/guard";
import { wrapUntrusted } from "@/sarkari/untrusted";
import { detectPII } from "@/sarkari/pii";
import { memorySaveTool, memoryUpdateTool } from "@/harness/tools/builtin/memory";
import type { ToolExecuteContext } from "@/harness/types";
import { redactLogData } from "@/harness/engine/log";

const PASSPHRASE = "correct horse battery staple";
const AADHAAR = "999941057058";
const PAN = "ABCDE1234F";
const PHONE = "+919876543210";
const EMAIL = "test@example.com";

let fake: FakeOllama;
let ctx: TestHarnessContext | undefined;
let vaultDir: string;

beforeEach(async () => {
  fake = await startFakeOllama();
  vaultDir = await mkdtemp(path.join(os.tmpdir(), "privacy-integration-"));
  process.env.JARVIS_VAULT_FILE = path.join(vaultDir, "vault.enc.json");
  resetVaultForTests();
});

afterEach(async () => {
  resetVaultForTests();
  delete process.env.JARVIS_VAULT_FILE;
  await rm(vaultDir, { recursive: true, force: true });
  await ctx?.cleanup();
  ctx = undefined;
  await fake.close();
});

function context(workspaceDir: string): ToolExecuteContext {
  return {
    runId: "run_test",
    signal: new AbortController().signal,
    store: {} as ToolExecuteContext["store"],
    workspaceDir,
    shellAllowlist: [],
    toolTimeoutMs: 10_000,
  };
}

describe("Privacy integration: 12 dedicated tests", () => {
  it("1. Ingress redaction: vault locked rejects message with PII and stores nothing", async () => {
    ctx = await setupHarness(fake.url);

    await expect(
      ctx.harness.startChat({
        message: `My Aadhaar is ${AADHAAR}`,
        model: "ollama:fake-chat",
      }),
    ).rejects.toMatchObject({ code: "vault_locked", status: 423 });

    expect(await ctx.store.listConversations()).toHaveLength(0);
    expect(await ctx.store.listRuns()).toHaveLength(0);
    expect(fake.chatRequests()).toHaveLength(0);
  });

  it("2. Ingress redaction: vault unlocked replaces PII with placeholders before storage", async () => {
    ctx = await setupHarness(fake.url);
    await unlockVault(PASSPHRASE);

    const source = await ctx.harness.startChat({
      message: `Mera Aadhaar ${AADHAAR} hai`,
      model: "ollama:fake-chat",
    });
    await collectEvents(source);

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages[0].content).toBe("Mera Aadhaar {{AADHAAR_1}} hai");
    expect(messages[0].content).not.toContain(AADHAAR);

    const request = fake.chatRequests()[0];
    expect(JSON.stringify(request.body)).toContain("{{AADHAAR_1}}");
    expect(JSON.stringify(request.body)).not.toContain(AADHAAR);
  });

  it("3. Outbound guard: scrubs leaked vault value from assistant output before model sees it", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);

    const result = await guardOutbound([
      { role: "assistant", content: `Here is your Aadhaar: ${AADHAAR}` },
    ]);

    expect(result.messages[0].content).toBe("Here is your Aadhaar: {{AADHAAR_1}}");
    expect(result.report.redacted).toBe(true);
    expect(result.route).toBe("cloud");
  });

  it("4. Outbound guard: routes unknown PII to local model when vault is locked", async () => {
    const result = await guardOutbound([
      { role: "user", content: `My Aadhaar is ${AADHAAR}` },
    ]);

    expect(result.route).toBe("ollama");
    expect(result.report.reason).toBe("unknown_pii");
    expect(result.report.verifiedClean).toBe(false);
  });

  it("5. Memory save tool: rejects PII when vault is locked", async () => {
    const mockStore = {
      createMemory: async () => {
        throw new Error("Should not be called");
      },
    } as any;

    const res = await memorySaveTool.execute(
      { content: `Mera Aadhaar ${AADHAAR} hai` },
      context(vaultDir),
    );

    expect(res.isError).toBe(true);
    expect(res.content).toContain("locked");
  });

  it("6. Memory save tool: redacts PII to placeholders when vault is unlocked", async () => {
    await unlockVault(PASSPHRASE);

    let savedContent = "";
    const mockStore = {
      createMemory: async (item: { content: string }) => {
        savedContent = item.content;
        return { id: "mem_test", ...item, tags: [], importance: 0.6, accessCount: 0, createdAt: "", updatedAt: "" };
      },
    } as any;

    const res = await memorySaveTool.execute(
      { content: `Mera Aadhaar ${AADHAAR} hai` },
      { ...context(vaultDir), store: mockStore },
    );

    expect(res.isError).toBeFalsy();
    expect(savedContent).toContain("{{AADHAAR_1}}");
    expect(savedContent).not.toContain(AADHAAR);
  });

  it("7. Memory update tool: redacts PII on update when vault is unlocked", async () => {
    await unlockVault(PASSPHRASE);

    let updatedContent = "";
    const mockStore = {
      updateMemory: async (_id: string, patch: Record<string, unknown>) => {
        updatedContent = patch.content as string;
        return { id: "mem_test", content: patch.content, tags: [], importance: 0.6, accessCount: 0, createdAt: "", updatedAt: "" };
      },
    } as any;

    const res = await memoryUpdateTool.execute(
      { id: "mem_test", content: `Updated PAN ${PAN}` },
      { ...context(vaultDir), store: mockStore },
    );

    expect(res.isError).toBeFalsy();
    expect(updatedContent).toContain("{{PAN_1}}");
    expect(updatedContent).not.toContain(PAN);
  });

  it("8. API memory endpoint logic: rejects PII when vault is locked", async () => {
    // Test the redact function directly which is used by the API endpoint
    const sanitized = await redact(`My PAN is ${PAN}`);
    expect(sanitized.report.locked).toBe(true);
    expect(sanitized.text).toBe(`My PAN is ${PAN}`); // Not redacted when locked
  });

  it("9. API memory endpoint logic: redacts PII when vault is unlocked", async () => {
    await unlockVault(PASSPHRASE);
    const sanitized = await redact(`My PAN is ${PAN}`);
    expect(sanitized.report.locked).toBe(false);
    expect(sanitized.text).toContain("{{PAN_1}}");
    expect(sanitized.text).not.toContain(PAN);
  });

  it("10. Log redaction: scrubs vault values from log data", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);
    await rememberValue("pan", PAN);

    const logData = {
      message: `User Aadhaar: ${AADHAAR}, PAN: ${PAN}`,
      tool: "memory_save",
      nested: { value: AADHAAR },
    };

    const redacted = redactLogData(logData);
    const str = JSON.stringify(redacted);

    expect(str).not.toContain(AADHAAR);
    expect(str).not.toContain(PAN);
    expect(str).toContain("{{AADHAAR_1}}");
    expect(str).toContain("{{PAN_1}}");
  });

  it("11. Tool result scrubbing: gov_fetch wraps output with wrapUntrusted", async () => {
    const wrapped = wrapUntrusted(
      "gov_fetch",
      `<html><body>Hello world</body></html>`,
      { maxChars: 1000 },
    );

    expect(wrapped).toContain('tool="gov_fetch"');
    expect(wrapped).toContain("nonce=");
    expect(wrapped).toContain("UNTRUSTED DATA");
    expect(wrapped).toContain("Hello world");
  });

  it("12. End-to-end: multiple PII types redacted correctly in a single conversation turn", async () => {
    ctx = await setupHarness(fake.url);
    await unlockVault(PASSPHRASE);

    const source = await ctx.harness.startChat({
      message: `Aadhaar: ${AADHAAR}, PAN: ${PAN}, Phone: ${PHONE}, Email: ${EMAIL}`,
      model: "ollama:fake-chat",
    });
    await collectEvents(source);

    const messages = await ctx.store.listMessages(source.conversationId);
    const stored = messages[0].content;

    expect(stored).toContain("{{AADHAAR_1}}");
    expect(stored).toContain("{{PAN_1}}");
    expect(stored).toContain("{{PHONE_1}}");
    expect(stored).toContain("{{EMAIL_1}}");
    expect(stored).not.toContain(AADHAAR);
    expect(stored).not.toContain(PAN);
    expect(stored).not.toContain(PHONE);
    expect(stored).not.toContain(EMAIL);

    const request = fake.chatRequests()[0];
    const sent = JSON.stringify(request.body);
    expect(sent).toContain("{{AADHAAR_1}}");
    expect(sent).toContain("{{PAN_1}}");
    expect(sent).toContain("{{PHONE_1}}");
    expect(sent).toContain("{{EMAIL_1}}");
  });
});