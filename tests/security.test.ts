import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MAX_JSON_BODY_BYTES,
  jsonError,
  readJson,
} from "@/lib/http";
import { HarnessError } from "@/harness/errors";
import {
  checkRateLimit,
  resetRateLimitsForTests,
} from "@/lib/rate-limit";
import {
  accessTokenFromHeaders,
  isAccessTokenRequired,
  verifyAccessToken,
} from "@/lib/access";
import { redactLogData, safeLog } from "@/harness/engine/log";
import { memorySaveTool, memoryUpdateTool } from "@/harness/tools/builtin/memory";
import { rememberValue, resetVaultForTests, unlockVault } from "@/sarkari/vault";

beforeEach(() => {
  resetRateLimitsForTests();
});

afterEach(() => {
  delete process.env.SAATHI_ACCESS_TOKEN;
});

describe("request body validation", () => {
  it("accepts JSON objects", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "hello" }),
    });
    await expect(readJson(request)).resolves.toEqual({ message: "hello" });
  });

  it("rejects malformed JSON and non-object bodies", async () => {
    const malformed = new Request("http://localhost/api/test", {
      method: "POST",
      body: "{not-json",
    });
    await expect(readJson(malformed)).rejects.toMatchObject({
      status: 400,
      code: "invalid_body",
    });

    const arrayBody = new Request("http://localhost/api/test", {
      method: "POST",
      body: "[1,2,3]",
    });
    await expect(readJson(arrayBody)).rejects.toMatchObject({
      status: 400,
      code: "invalid_body",
    });
  });

  it("rejects oversized bodies", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body: "x".repeat(MAX_JSON_BODY_BYTES + 1),
    });
    await expect(readJson(request)).rejects.toMatchObject({
      status: 413,
      code: "payload_too_large",
    });
  });
});

describe("error responses", () => {
  it("does not leak unexpected internal error details", async () => {
    const response = jsonError(new Error("database password=hunter2 connection refused"));
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; code: string };
    expect(body).toEqual({ error: "Internal server error.", code: "internal_error" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("preserves intentional harness errors", async () => {
    const response = jsonError(
      new HarnessError("Conversation not found.", { status: 404, code: "not_found" }),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Conversation not found.",
      code: "not_found",
    });
  });
});

describe("log redaction", () => {
  it("redacts secret keys and truncates large values", () => {
    const redacted = redactLogData({
      tool: "file_write",
      apiKey: "super-secret-key",
      nested: { password: "hunter2", note: "x".repeat(1000) },
      items: Array.from({ length: 30 }, (_, index) => index),
    }) as Record<string, unknown>;

    expect(redacted.tool).toBe("file_write");
    expect(redacted.apiKey).toBe("[redacted]");
    expect((redacted.nested as Record<string, unknown>).password).toBe("[redacted]");
    expect(String((redacted.nested as Record<string, unknown>).note)).toContain("[truncated]");
    expect(redacted.items).toHaveLength(20);
  });

  it("scrubs vault secret values from log messages and string values", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "log-vault-"));
    process.env.SAATHI_VAULT_FILE = path.join(vaultDir, "vault.enc.json");
    resetVaultForTests();
    await unlockVault("test-passphrase");
    await rememberValue("aadhaar", "999941057058");

    const scrubbed = redactLogData("User Aadhaar is 999941057058 in the database");
    expect(scrubbed).not.toContain("999941057058");
    expect(scrubbed).toContain("{{AADHAAR_1}}");

    resetVaultForTests();
    delete process.env.SAATHI_VAULT_FILE;
    await rm(vaultDir, { recursive: true, force: true });
  });
});

describe("memory PII protection", () => {
  it("redacts PII to placeholders when saving memory with unlocked vault", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mem-vault-"));
    process.env.SAATHI_VAULT_FILE = path.join(vaultDir, "vault.enc.json");
    resetVaultForTests();
    await unlockVault("test-passphrase");

    let savedContent = "";
    const mockStore = {
      createMemory: async (item: { content: string }) => {
        savedContent = item.content;
        return { id: "mem_test", ...item, tags: [], importance: 0.6, accessCount: 0, createdAt: "", updatedAt: "" };
      },
    } as any;

    const ctx = {
      runId: "run_test",
      signal: new AbortController().signal,
      store: mockStore,
      workspaceDir: vaultDir,
      shellAllowlist: [],
      toolTimeoutMs: 5000,
    };

    const res = await memorySaveTool.execute({ content: "Mera Aadhaar 999941057058 hai" }, ctx);
    expect(res.isError).toBeFalsy();
    expect(savedContent).not.toContain("999941057058");
    expect(savedContent).toContain("{{AADHAAR_1}}");

    resetVaultForTests();
    delete process.env.SAATHI_VAULT_FILE;
    await rm(vaultDir, { recursive: true, force: true });
  });

  it("rejects saving memory containing PII when vault is locked", async () => {
    const vaultDir = await mkdtemp(path.join(os.tmpdir(), "mem-vault-locked-"));
    process.env.SAATHI_VAULT_FILE = path.join(vaultDir, "vault.enc.json");
    resetVaultForTests();

    const mockStore = {
      createMemory: async () => {
        throw new Error("Should not be called");
      },
    } as any;

    const ctx = {
      runId: "run_test",
      signal: new AbortController().signal,
      store: mockStore,
      workspaceDir: vaultDir,
      shellAllowlist: [],
      toolTimeoutMs: 5000,
    };

    const res = await memorySaveTool.execute({ content: "Mera Aadhaar 999941057058 hai" }, ctx);
    expect(res.isError).toBe(true);
    expect(res.content).toContain("locked");

    resetVaultForTests();
    delete process.env.SAATHI_VAULT_FILE;
    await rm(vaultDir, { recursive: true, force: true });
  });
});

describe("rate limiting", () => {
  it("allows up to the limit and then blocks within the window", () => {
    const options = { limit: 3, windowMs: 60_000, now: 1000 };
    expect(checkRateLimit("a", options).allowed).toBe(true);
    expect(checkRateLimit("a", options).allowed).toBe(true);
    expect(checkRateLimit("a", options).allowed).toBe(true);
    const blocked = checkRateLimit("a", options);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    expect(checkRateLimit("b", options).allowed).toBe(true);
  });

  it("resets after the window expires", () => {
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000, now: 0 }).allowed).toBe(true);
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000, now: 500 }).allowed).toBe(false);
    expect(checkRateLimit("a", { limit: 1, windowMs: 1000, now: 1001 }).allowed).toBe(true);
  });
});

describe("access token verification", () => {
  it("is disabled when no token is configured", async () => {
    expect(isAccessTokenRequired()).toBe(false);
    await expect(verifyAccessToken(undefined)).resolves.toBe(true);
  });

  it("requires an exact configured token", async () => {
    process.env.SAATHI_ACCESS_TOKEN = "correct-horse-battery-staple";
    expect(isAccessTokenRequired()).toBe(true);
    await expect(verifyAccessToken("correct-horse-battery-staple")).resolves.toBe(true);
    await expect(verifyAccessToken("wrong-token")).resolves.toBe(false);
    await expect(verifyAccessToken(undefined)).resolves.toBe(false);
  });

  it("reads bearer and x-saathi-token headers", () => {
    expect(accessTokenFromHeaders(new Headers({ Authorization: "Bearer abc" }))).toBe("abc");
    expect(accessTokenFromHeaders(new Headers({ Authorization: "bearer abc" }))).toBe("abc");
    expect(accessTokenFromHeaders(new Headers({ "x-saathi-token": "xyz" }))).toBe("xyz");
    expect(accessTokenFromHeaders(new Headers({ Authorization: "Basic abc" }))).toBeUndefined();
  });
});
