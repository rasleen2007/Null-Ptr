import { promises as fs } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startFakeOllama, type FakeOllama } from "../helpers/fake-ollama";
import {
  finalEvent,
  readSse,
  startNextServer,
  textFrom,
  type NextServer,
} from "../helpers/next-server";

const TOKEN = "e2e-secret-token";
let fake: FakeOllama;
let server: NextServer;

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${TOKEN}`, ...extra };
}

function api(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${server.baseUrl}${pathname}`, {
    cache: "no-store",
    ...init,
    headers: authHeaders((init.headers as Record<string, string> | undefined) ?? {}),
  });
}

async function postJson(pathname: string, body: unknown): Promise<Response> {
  return api(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  fake = await startFakeOllama();
  server = await startNextServer({ OLLAMA_BASE_URL: fake.url });
}, 120_000);

afterAll(async () => {
  await server?.stop();
  await fake?.close();
});

describe("production HTTP API E2E", () => {
  it("serves health without auth and advertises protection without leaking the token", async () => {
    const response = await fetch(`${server.baseUrl}/api/health`, { cache: "no-store" });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.storage).toBe("local");
    expect(body.authRequired).toBe(true);
    expect((body.auth as Record<string, unknown>).required).toBe(true);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it("blocks unauthenticated API calls and accepts bearer or x-jarvis-token credentials", async () => {
    const anonymous = await fetch(`${server.baseUrl}/api/conversations`, { cache: "no-store" });
    expect(anonymous.status).toBe(401);
    await expect(anonymous.json()).resolves.toMatchObject({ code: "unauthorized" });

    const wrong = await fetch(`${server.baseUrl}/api/conversations`, {
      cache: "no-store",
      headers: { Authorization: "Bearer wrong-token" },
    });
    expect(wrong.status).toBe(401);

    const headerToken = await fetch(`${server.baseUrl}/api/conversations`, {
      cache: "no-store",
      headers: { "x-jarvis-token": TOKEN },
    });
    expect(headerToken.status).toBe(200);

    const authMissing = await fetch(`${server.baseUrl}/api/auth`, { cache: "no-store" });
    expect(authMissing.status).toBe(401);
    const authOk = await fetch(`${server.baseUrl}/api/auth`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(authOk.status).toBe(200);
    await expect(authOk.json()).resolves.toEqual({ ok: true, authRequired: true });
  });

  it("streams a chat over SSE and persists the conversation for reload", async () => {
    const response = await postJson("/api/chat", {
      message: "Hello over HTTP",
      model: "ollama:fake-chat",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const events = await readSse(response);
    expect(textFrom(events)).toBe("Hello from fake Ollama.");
    expect(finalEvent(events).status).toBe("completed");

    const run = events.find((event) => event.type === "run") as
      | { conversationId: string; runId: string }
      | undefined;
    expect(run?.conversationId).toMatch(/^conv_/);
    expect(run?.runId).toMatch(/^run_/);

    const detailResponse = await api(`/api/conversations/${run?.conversationId}`);
    expect(detailResponse.status).toBe(200);
    const detail = (await detailResponse.json()) as {
      conversation: { title: string; messageCount: number };
      messages: { role: string; content: string }[];
    };
    expect(detail.conversation.title).toBe("Hello over HTTP");
    expect(detail.messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(detail.messages[1].content).toBe("Hello from fake Ollama.");

    const listResponse = await api("/api/conversations");
    expect(listResponse.status).toBe(200);
    const list = (await listResponse.json()) as { conversations: { id: string }[] };
    expect(list.conversations.some((conversation) => conversation.id === run?.conversationId)).toBe(
      true,
    );
  });

  it("returns a clear 400 when the selected provider has no credentials", async () => {
    const response = await postJson("/api/chat", {
      message: "No key here",
      model: "groq:llama-3.3-70b-versatile",
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "provider_not_configured" });
  });

  it("streams provider failures as error and done events", async () => {
    const response = await postJson("/api/chat", {
      message: "Explode",
      model: "ollama:fake-error",
    });
    expect(response.status).toBe(200);
    const events = await readSse(response);
    expect(events.find((event) => event.type === "error")).toMatchObject({
      code: "provider_error",
    });
    expect(finalEvent(events).status).toBe("failed");
  });

  it("exposes vault metadata only and rejects a wrong passphrase distinctly", async () => {
    const created = await postJson("/api/vault", {
      action: "unlock",
      passphrase: "e2e vault passphrase",
    });
    expect(created.status).toBe(200);
    await expect(created.json()).resolves.toMatchObject({
      exists: true,
      unlocked: true,
      fields: [],
    });

    const chat = await postJson("/api/chat", {
      message: "My Aadhaar is 999941057058",
      model: "ollama:fake-chat",
    });
    expect(chat.status).toBe(200);
    await readSse(chat);

    const response = await api("/api/vault");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      unlocked: boolean;
      fields: { placeholder: string; type: string }[];
    };
    expect(body.unlocked).toBe(true);
    expect(body.fields).toContainEqual(
      expect.objectContaining({ placeholder: "{{AADHAAR_1}}", type: "aadhaar" }),
    );
    expect(JSON.stringify(body)).not.toContain("999941057058");

    const locked = await postJson("/api/vault", { action: "lock" });
    expect(locked.status).toBe(200);
    expect(JSON.stringify(await locked.json())).not.toContain("999941057058");

    const wrong = await postJson("/api/vault", {
      action: "unlock",
      passphrase: "wrong passphrase",
    });
    expect(wrong.status).toBe(401);
    await expect(wrong.json()).resolves.toMatchObject({ code: "wrong_passphrase" });
  });

  it("pauses for approval and resumes only after an authenticated approval", async () => {
    const settingsResponse = await api("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { allowFileWrite: true } }),
    });
    expect(settingsResponse.status).toBe(200);

    const first = await postJson("/api/chat", {
      kind: "agent",
      message: "Write the approval note",
      model: "ollama:fake-tool",
    });
    const firstEvents = await readSse(first);
    const permission = firstEvents.find((event) => event.type === "permission_request") as
      | { runId: string; call: { id: string; name: string } }
      | undefined;
    expect(permission?.call.name).toBe("file_write");
    expect(finalEvent(firstEvents).status).toBe("awaiting_approval");

    const unauthorizedResume = await fetch(
      `${server.baseUrl}/api/runs/${permission?.runId}/resume`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true, toolCallId: permission?.call.id }),
      },
    );
    expect(unauthorizedResume.status).toBe(401);

    const resumed = await postJson(`/api/runs/${permission?.runId}/resume`, {
      approved: true,
      toolCallId: permission?.call.id,
    });
    expect(resumed.status).toBe(200);
    const resumedEvents = await readSse(resumed);
    expect(resumedEvents.some((event) => event.type === "tool_result")).toBe(true);
    expect(textFrom(resumedEvents)).toBe("The write was approved and completed.");
    expect(finalEvent(resumedEvents).status).toBe("completed");

    const written = await fs.readFile(
      path.join(server.workspaceDir, "notes", "approval.txt"),
      "utf8",
    );
    expect(written).toBe("approved by test");
  });

  it("cancels an in-flight run through the API and ends the stream as cancelled", async () => {
    const response = await postJson("/api/chat", {
      message: "Stream slowly",
      model: "ollama:fake-slow",
    });
    let runId: string | undefined;
    let cancelStatus: number | undefined;

    const events = await readSse(response, async (event) => {
      if (event.type === "run") runId = String(event.runId);
      if (event.type === "delta" && !cancelStatus && runId) {
        const cancelled = await postJson(`/api/runs/${runId}/cancel`, {});
        cancelStatus = cancelled.status;
      }
    });

    expect(cancelStatus).toBe(200);
    expect(finalEvent(events).status).toBe("cancelled");
  });
});
