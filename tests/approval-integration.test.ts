import { promises as fs } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startFakeOllama, type FakeOllama } from "./helpers/fake-ollama";
import {
  collectEvents,
  finalEvent,
  setupHarness,
  textFrom,
  type TestHarnessContext,
} from "./helpers/harness";
import type { StreamEvent } from "@/harness/types";

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

async function requestApproval(context: TestHarnessContext) {
  await context.harness.updateSettings({ permissions: { allowFileWrite: true } });
  const source = await context.harness.startChat({
    message: "Write a note to the workspace",
    model: "ollama:fake-tool",
  });
  const events = await collectEvents(source);
  const permission = events.find(
    (event): event is Extract<StreamEvent, { type: "permission_request" }> =>
      event.type === "permission_request",
  );
  return { source, events, permission };
}

describe("approval workflow integration", () => {
  it("pauses on a sensitive tool and exposes a permission request", async () => {
    ctx = await setupHarness(fake.url);
    const { source, events, permission } = await requestApproval(ctx);

    expect(permission).toBeDefined();
    expect(permission?.call.name).toBe("file_write");
    expect(permission?.call.arguments).toMatchObject({
      path: "notes/approval.txt",
      content: "approved by test",
    });
    expect(permission?.tool.sensitivity).toBe("sensitive");
    expect(permission?.reason).toMatch(/explicitly approve/i);
    expect(permission?.runId).toBe(source.runId);

    expect(finalEvent(events).status).toBe("awaiting_approval");
    const run = await ctx.store.getRun(source.runId);
    expect(run?.status).toBe("awaiting_approval");
    expect(run?.state.awaitingCall?.name).toBe("file_write");

    await expect(
      fs.access(path.join(ctx.workspaceDir, "notes", "approval.txt")),
    ).rejects.toThrow();

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages.map((message) => message.role)).toEqual(["user", "assistant"]);
    expect(messages[1].toolCalls?.[0].name).toBe("file_write");
  });

  it("executes the approved tool, resumes the run, and completes", async () => {
    ctx = await setupHarness(fake.url);
    const { source, permission } = await requestApproval(ctx);
    if (!permission) throw new Error("Expected a permission request.");

    const resumed = await ctx.harness.resumeRun(source.runId, {
      approved: true,
      toolCallId: permission.call.id,
    });
    const events = await collectEvents(resumed);

    const toolResult = events.find((event) => event.type === "tool_result");
    expect(toolResult).toMatchObject({ type: "tool_result", isError: false });
    expect((toolResult as { content: string }).content).toContain('"written":true');
    expect(textFrom(events)).toBe("The write was approved and completed.");
    expect(finalEvent(events).status).toBe("completed");

    const written = await fs.readFile(path.join(ctx.workspaceDir, "notes", "approval.txt"), "utf8");
    expect(written).toBe("approved by test");

    const messages = await ctx.store.listMessages(source.conversationId);
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
    expect(messages[2].content).toContain('"written":true');
    expect(messages[3].content).toBe("The write was approved and completed.");

    const run = await ctx.store.getRun(source.runId);
    expect(run?.status).toBe("completed");
    expect(run?.state.awaitingCall).toBeUndefined();
  });

  it("never executes a rejected tool and returns the denial to the model", async () => {
    ctx = await setupHarness(fake.url);
    const { source, permission } = await requestApproval(ctx);
    if (!permission) throw new Error("Expected a permission request.");

    const resumed = await ctx.harness.resumeRun(source.runId, {
      approved: false,
      note: "No writes during the demo",
      toolCallId: permission.call.id,
    });
    const events = await collectEvents(resumed);
    expect(finalEvent(events).status).toBe("completed");
    expect(textFrom(events)).toBe("The write was denied. Nothing was executed.");

    await expect(
      fs.access(path.join(ctx.workspaceDir, "notes", "approval.txt")),
    ).rejects.toThrow();

    const messages = await ctx.store.listMessages(source.conversationId);
    const toolMessage = messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toContain("Permission denied by the user");
    expect(toolMessage?.content).toContain("No writes during the demo");
    expect(messages.map((message) => message.role)).toEqual([
      "user",
      "assistant",
      "tool",
      "assistant",
    ]);
  });

  it("persists the pending approval across a harness/storage restart", async () => {
    ctx = await setupHarness(fake.url);
    const { source, permission } = await requestApproval(ctx);
    if (!permission) throw new Error("Expected a permission request.");

    const restarted = await ctx.recreate();
    const runAfterRestart = await restarted.store.getRun(source.runId);
    expect(runAfterRestart?.status).toBe("awaiting_approval");
    expect(runAfterRestart?.state.awaitingCall?.id).toBe(permission.call.id);

    const resumed = await restarted.resumeRun(source.runId, {
      approved: true,
      toolCallId: permission.call.id,
    });
    const events = await collectEvents(resumed);
    expect(finalEvent(events).status).toBe("completed");
    expect(await fs.readFile(path.join(ctx.workspaceDir, "notes", "approval.txt"), "utf8")).toBe(
      "approved by test",
    );
  });

  it("rejects mismatched, unknown, and non-pending resumes", async () => {
    ctx = await setupHarness(fake.url);
    const { source, permission } = await requestApproval(ctx);
    if (!permission) throw new Error("Expected a permission request.");

    await expect(
      ctx.harness.resumeRun(source.runId, { approved: true, toolCallId: "call_wrong" }),
    ).rejects.toMatchObject({ code: "approval_mismatch", status: 409 });

    await expect(
      ctx.harness.resumeRun("run_missing", { approved: true }),
    ).rejects.toMatchObject({ code: "not_found", status: 404 });

    const approved = await ctx.harness.resumeRun(source.runId, {
      approved: true,
      toolCallId: permission.call.id,
    });
    await collectEvents(approved);

    await expect(
      ctx.harness.resumeRun(source.runId, { approved: true, toolCallId: permission.call.id }),
    ).rejects.toMatchObject({ code: "run_not_awaiting_approval", status: 409 });
  });

  it("does not request approval for safe tools", async () => {
    ctx = await setupHarness(fake.url);
    const events = await collectEvents(
      await ctx.harness.startChat({
        message: "Just chat",
        model: "ollama:fake-chat",
      }),
    );
    expect(events.some((event) => event.type === "permission_request")).toBe(false);
    expect(finalEvent(events).status).toBe("completed");
  });
});
