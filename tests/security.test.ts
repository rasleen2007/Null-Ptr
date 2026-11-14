import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { redactLogData } from "@/harness/engine/log";

beforeEach(() => {
  resetRateLimitsForTests();
});

afterEach(() => {
  delete process.env.JARVIS_ACCESS_TOKEN;
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
    process.env.JARVIS_ACCESS_TOKEN = "correct-horse-battery-staple";
    expect(isAccessTokenRequired()).toBe(true);
    await expect(verifyAccessToken("correct-horse-battery-staple")).resolves.toBe(true);
    await expect(verifyAccessToken("wrong-token")).resolves.toBe(false);
    await expect(verifyAccessToken(undefined)).resolves.toBe(false);
  });

  it("reads bearer and x-jarvis-token headers", () => {
    expect(accessTokenFromHeaders(new Headers({ Authorization: "Bearer abc" }))).toBe("abc");
    expect(accessTokenFromHeaders(new Headers({ Authorization: "bearer abc" }))).toBe("abc");
    expect(accessTokenFromHeaders(new Headers({ "x-jarvis-token": "xyz" }))).toBe("xyz");
    expect(accessTokenFromHeaders(new Headers({ Authorization: "Basic abc" }))).toBeUndefined();
  });
});
