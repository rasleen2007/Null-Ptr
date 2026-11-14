import type {
  AppSettings,
  ChatRequest,
  Conversation,
  HarnessEventSource,
  ModelInfo,
  ProviderEvent,
  ProviderId,
  ProviderStatus,
  RunRecord,
  RunState,
  RunStatus,
  StreamEvent,
  ToolCall,
  ToolDefinition,
  ToolInfo,
} from "./types";
import type { Storage } from "./storage/types";
import { getStorage } from "./storage";
import {
  createDefaultSettings,
  getServerConfig,
  type ServerConfig,
} from "./config";
import { HarnessError, ProviderError, toErrorMessage, ValidationError } from "./errors";
import { createId } from "./utils";
import { buildProviderContext, estimateTokens } from "./context";
import { retrieveMemoryContext } from "./memory/manager";
import { createProviderRegistry, getProviderStatuses, listAllModels, resolveModel } from "./providers";
import { MODEL_CATALOG, PROVIDER_LABELS, normalizeModelId } from "./providers/catalog";
import { createToolRegistry, executeToolWithTimeout, getToolAvailability, requiresApproval } from "./tools";
import type { ToolRegistry } from "./tools";
import { getActiveRuns } from "./engine/active-runs";
import { safeLog } from "./engine/log";

const MAX_MESSAGE_LENGTH = 30_000;

export type SettingsPatch = Partial<Omit<AppSettings, "permissions">> & {
  permissions?: Partial<AppSettings["permissions"]>;
};

function clampTemperature(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(2, value));
}

function deriveTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  return cleaned.length > 60 ? `${cleaned.slice(0, 57).trim()}…` : cleaned;
}

function toolInfo(tool: ToolDefinition, settings: AppSettings, config: ServerConfig): ToolInfo {
  const availability = getToolAvailability(tool, settings, config);
  return {
    name: tool.name,
    description: tool.description,
    category: tool.category,
    sensitivity: tool.sensitivity,
    parameters: tool.parameters,
    enabled: availability.enabled,
    disabledReason: availability.reason,
  };
}

async function* streamProviderWithRetry(
  adapter: ReturnType<typeof createProviderRegistry>[ProviderId],
  request: Parameters<ReturnType<typeof createProviderRegistry>[ProviderId]["stream"]>[0],
  signal: AbortSignal,
  maxAttempts = 2,
): AsyncGenerator<ProviderEvent> {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    let emitted = false;
    try {
      for await (const event of adapter.stream({ ...request, signal })) {
        if (event.type === "text" && event.delta) emitted = true;
        if (event.type === "tool_call") emitted = true;
        yield event;
      }
      return;
    } catch (error) {
      const retryable =
        error instanceof ProviderError && error.retryable && !emitted && !signal.aborted;
      if (retryable && attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
        continue;
      }
      throw error;
    }
  }
}

export interface Harness {
  config: ServerConfig;
  store: Storage;
  startChat: (input: ChatRequest) => Promise<HarnessEventSource>;
  resumeRun: (
    runId: string,
    decision: { approved: boolean; note?: string; toolCallId?: string },
  ) => Promise<HarnessEventSource>;
  cancelRun: (runId: string) => Promise<boolean>;
  listModels: () => Promise<ModelInfo[]>;
  providerStatuses: () => Promise<ProviderStatus[]>;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (patch: SettingsPatch) => Promise<AppSettings>;
  toolInfos: () => Promise<ToolInfo[]>;
  getRun: (runId: string) => Promise<RunRecord | null>;
}

export function createHarness(options: {
  store: Storage;
  config?: ServerConfig;
}): Harness {
  const store = options.store;
  const config = options.config ?? getServerConfig();
  const providers = createProviderRegistry(config);
  const tools = createToolRegistry(config);
  const activeRuns = getActiveRuns();

  async function settingsWithDefaults(): Promise<AppSettings> {
    const stored = await store.getSettings();
    const defaults = createDefaultSettings(config);
    const merged: AppSettings = {
      ...defaults,
      ...stored,
      permissions: { ...defaults.permissions, ...stored.permissions },
    };

    // Migrate retired or malformed stored selections so an old default does not
    // keep producing provider 404s after a restart.
    const normalized = normalizeModelId(merged.defaultModel || defaults.defaultModel);
    merged.defaultModel = normalized.includes(":") ? normalized : defaults.defaultModel;
    if (stored.defaultModel !== merged.defaultModel) {
      await store
        .updateSettings({ defaultModel: merged.defaultModel })
        .catch(() => undefined);
    }
    return merged;
  }

  async function runAgent(input: {
    run: RunRecord;
    conversation: Conversation;
    state: RunState;
    settings: AppSettings;
    isNewConversation: boolean;
    touchMemory: boolean;
    signal: AbortSignal;
  }): Promise<AsyncGenerator<StreamEvent>> {
    const { run, conversation, state, settings, isNewConversation, touchMemory, signal } = input;
    const resolved = resolveModel(state.model, providers);
    const providerId = resolved.provider;
    const modelInfo = resolved.info;
    const enabledTools =
      settings.toolsEnabled && state.useTools !== false
        ? tools.availableForModel(settings, modelInfo)
        : [];

    const memory = settings.memoryEnabled
      ? await retrieveMemoryContext(
          store,
          await lastUserMessage(conversation.id, run.input),
          settings.memoryLimit,
          touchMemory,
        )
      : { memories: [], promptBlock: "" };

    async function lastUserMessage(conversationId: string, fallback: string): Promise<string> {
      const messages = await store.listMessages(conversationId);
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === "user") return messages[i].content;
      }
      return fallback;
    }

    async function persistRun(patch: {
      status?: RunStatus;
      error?: string;
    }): Promise<void> {
      await store.updateRun(run.id, {
        status: patch.status ?? run.status,
        state,
        error: patch.error,
      });
      if (patch.status) run.status = patch.status;
    }

    async function addToolResult(call: ToolCall, content: string, isError: boolean) {
      await store.addMessage({
        conversationId: conversation.id,
        role: "tool",
        content,
        toolCallId: call.id,
        toolName: call.name,
      });
      await safeLog(store, {
        runId: run.id,
        conversationId: conversation.id,
        level: isError ? "warn" : "info",
        event: "tool_result",
        message: `${call.name} → ${isError ? "error" : "ok"}`,
        data: { tool: call.name, callId: call.id, isError },
      });
    }

    const maxIterations = Math.max(1, Math.min(20, settings.maxIterations));

    return (async function* generator(): AsyncGenerator<StreamEvent> {
      let status: RunStatus = "running";
      let finalMessageId: string | undefined;
      let failure: string | undefined;
      let textBuffer = "";
      let assistantSaved = false;

      async function finish(next: RunStatus, reason?: string): Promise<void> {
        status = next;
        await store.updateRun(run.id, { status: next, state, error: reason });
      }

      if (isNewConversation) {
        yield {
          type: "title",
          conversationId: conversation.id,
          title: conversation.title,
        };
      }

      try {
        while (true) {
          const fresh = await store.getRun(run.id);
          if (signal.aborted || fresh?.status === "cancelled") {
            await finish("cancelled");
            await safeLog(store, {
              runId: run.id,
              conversationId: conversation.id,
              level: "warn",
              event: "run_cancelled",
              message: "Run cancelled.",
            });
            yield { type: "done", runId: run.id, status: "cancelled", messageId: finalMessageId };
            return;
          }

          if (state.pendingIndex < state.pendingCalls.length) {
            const call = state.pendingCalls[state.pendingIndex];

            if (state.deniedCallId === call.id) {
              const note = state.denialNote ? ` User note: ${state.denialNote}` : "";
              await addToolResult(
                call,
                `Permission denied by the user. The tool was not executed.${note}`,
                true,
              );
              state.deniedCallId = undefined;
              state.denialNote = undefined;
              state.pendingIndex += 1;
              await persistRun({});
              continue;
            }

            const tool = tools.get(call.name);
            if (!tool) {
              await addToolResult(call, `Unknown tool "${call.name}".`, true);
              state.pendingIndex += 1;
              await persistRun({});
              continue;
            }

            const availability = getToolAvailability(tool, settings, config);
            if (!availability.enabled) {
              await addToolResult(
                call,
                `Tool "${call.name}" is disabled: ${availability.reason ?? "unavailable"}.`,
                true,
              );
              state.pendingIndex += 1;
              await persistRun({});
              continue;
            }

            if (requiresApproval(tool) && state.approvedCallId !== call.id) {
              state.awaitingCall = call;
              await persistRun({ status: "awaiting_approval" });
              status = "awaiting_approval";
              await safeLog(store, {
                runId: run.id,
                conversationId: conversation.id,
                level: "warn",
                event: "permission_requested",
                message: `Approval requested for ${call.name}.`,
                data: { tool: call.name, arguments: call.arguments },
              });
              yield {
                type: "tool_call",
                runId: run.id,
                call,
                sensitivity: tool.sensitivity,
                category: tool.category,
              };
              yield {
                type: "permission_request",
                runId: run.id,
                call,
                tool: toolInfo(tool, settings, config),
                reason:
                  "This is a sensitive tool. JARVIS will not run it until you explicitly approve.",
              };
              yield { type: "done", runId: run.id, status: "awaiting_approval", messageId: finalMessageId };
              return;
            }

            if (state.approvedCallId === call.id) {
              state.approvedCallId = undefined;
              state.awaitingCall = undefined;
            }

            yield {
              type: "tool_call",
              runId: run.id,
              call,
              sensitivity: tool.sensitivity,
              category: tool.category,
            };

            const result = await executeToolWithTimeout(
              tool,
              call.arguments,
              {
                runId: run.id,
                conversationId: conversation.id,
                signal,
                store,
                workspaceDir: config.workspaceDir,
                shellAllowlist: config.shellAllowlist,
                toolTimeoutMs: config.toolTimeoutMs,
              },
              config.toolTimeoutMs,
            );

            yield {
              type: "tool_result",
              runId: run.id,
              call,
              content: result.content,
              isError: Boolean(result.isError),
            };
            await addToolResult(call, result.content, Boolean(result.isError));
            state.pendingIndex += 1;
            await persistRun({});
            continue;
          }

          state.pendingCalls = [];
          state.pendingIndex = 0;

          if (state.iteration >= maxIterations) {
            failure = `Iteration limit reached (${maxIterations}). The agent stopped to avoid an unbounded loop.`;
            await finish("failed", failure);
            yield { type: "error", message: failure, code: "iteration_limit" };
            yield { type: "done", runId: run.id, status: "failed", messageId: finalMessageId };
            return;
          }

          state.iteration += 1;
          await persistRun({});
          yield { type: "iteration", iteration: state.iteration, maxIterations };

          if (state.iteration === 1) {
            yield {
              type: "thinking",
              message: memory.memories.length
                ? `Recalled ${memory.memories.length} long-term memory item(s). Routing to ${modelInfo.label}.`
                : `Routing to ${modelInfo.label}.`,
            };
          } else {
            yield {
              type: "thinking",
              message: `Continuing with ${modelInfo.label} (step ${state.iteration}/${maxIterations}).`,
            };
          }

          const history = await store.listMessages(conversation.id);
          const context = buildProviderContext({
            systemPrompt: state.systemPrompt,
            messages: history,
            memoryBlock: memory.promptBlock,
            tokenBudget: config.contextTokenBudget,
          });

          await safeLog(store, {
            runId: run.id,
            conversationId: conversation.id,
            level: "debug",
            event: "context_built",
            message: `Context: ${context.messages.length} messages, ~${context.estimatedTokens} tokens, ${context.trimmedTurns} turn(s) trimmed.`,
            data: { trimmedTurns: context.trimmedTurns, estimatedTokens: context.estimatedTokens },
          });

          textBuffer = "";
          assistantSaved = false;
          const toolCalls: ToolCall[] = [];
          let finishReason: string | undefined;

          try {
            for await (const event of streamProviderWithRetry(
              resolved.adapter,
              {
                model: modelInfo.model,
                messages: context.messages,
                tools: enabledTools,
                temperature: state.temperature,
              },
              signal,
            )) {
              if (event.type === "text") {
                textBuffer += event.delta;
                yield { type: "delta", text: event.delta };
              } else if (event.type === "tool_call") {
                toolCalls.push(event.call);
              } else if (event.type === "usage") {
                yield {
                  type: "usage",
                  promptTokens: event.promptTokens,
                  completionTokens: event.completionTokens,
                };
              } else if (event.type === "done") {
                finishReason = event.finishReason;
              }
            }
          } catch (error) {
            if (signal.aborted) {
              await finish("cancelled");
              yield { type: "done", runId: run.id, status: "cancelled", messageId: finalMessageId };
              return;
            }
            failure = toErrorMessage(error);
            await finish("failed", failure);
            await safeLog(store, {
              runId: run.id,
              conversationId: conversation.id,
              level: "error",
              event: "provider_error",
              message: failure,
              data: { provider: providerId, model: modelInfo.id },
            });
            yield { type: "error", message: failure, code: "provider_error" };
            yield { type: "done", runId: run.id, status: "failed", messageId: finalMessageId };
            return;
          }

          if (!textBuffer.trim() && !toolCalls.length) {
            failure =
              finishReason === "content_filter"
                ? "The provider returned no content (possibly filtered)."
                : "The provider returned an empty response. Try a different model.";
            await finish("failed", failure);
            yield { type: "error", message: failure, code: "empty_response" };
            yield { type: "done", runId: run.id, status: "failed", messageId: finalMessageId };
            return;
          }

          const assistant = await store.addMessage({
            conversationId: conversation.id,
            role: "assistant",
            content: textBuffer,
            toolCalls: toolCalls.length ? toolCalls : undefined,
            provider: providerId,
            model: modelInfo.id,
            tokenEstimate: estimateTokens(textBuffer),
          });
          assistantSaved = true;
          finalMessageId = assistant.id;

          if (!toolCalls.length) {
            await finish("completed");
            await safeLog(store, {
              runId: run.id,
              conversationId: conversation.id,
              level: "info",
              event: "run_completed",
              message: `Completed in ${state.iteration} iteration(s).`,
              data: { provider: providerId, model: modelInfo.id, finishReason },
            });
            yield { type: "done", runId: run.id, status: "completed", messageId: finalMessageId };
            return;
          }

          state.pendingCalls = toolCalls;
          state.pendingIndex = 0;
          await persistRun({});
          await safeLog(store, {
            runId: run.id,
            conversationId: conversation.id,
            level: "info",
            event: "tool_calls_requested",
            message: `Model requested ${toolCalls.length} tool call(s).`,
            data: { tools: toolCalls.map((call) => call.name) },
          });
          yield {
            type: "thinking",
            message: `Executing ${toolCalls.length} tool call(s).`,
          };
        }
      } catch (error) {
        failure = toErrorMessage(error);
        if (status === "running" || status === "awaiting_approval") {
          await finish("failed", failure).catch(() => undefined);
        }
        yield { type: "error", message: failure, code: "harness_error" };
        yield { type: "done", runId: run.id, status: "failed", messageId: finalMessageId };
      } finally {
        if (status === "running") {
          const cancelled = signal.aborted;
          await finish(cancelled ? "cancelled" : "failed", failure).catch(() => undefined);
        }
        if (textBuffer && !assistantSaved && conversation.id) {
          await store
            .addMessage({
              conversationId: conversation.id,
              role: "assistant",
              content: `${textBuffer}\n\n[Interrupted before completion]`,
              provider: providerId,
              model: modelInfo.id,
            })
            .catch(() => undefined);
        }
        activeRuns.delete(run.id);
        run.updatedAt = new Date().toISOString();
      }
    })();
  }

  async function startChat(input: ChatRequest): Promise<HarnessEventSource> {
    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (!message) throw new ValidationError("Message is required.");
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new ValidationError(`Message exceeds ${MAX_MESSAGE_LENGTH} characters.`);
    }

    const settings = await settingsWithDefaults();
    let conversation: Conversation | null = null;
    if (input.conversationId) {
      conversation = await store.getConversation(input.conversationId);
      if (!conversation) throw new HarnessError("Conversation not found.", { status: 404, code: "not_found" });
    }

    const requestedModelId = normalizeModelId(
      input.model?.trim() || conversation?.model || settings.defaultModel,
    );
    const resolved = resolveModel(requestedModelId, providers);
    // Store the canonical id (retired names are mapped, "models/" is stripped)
    // so conversation history and future runs agree with the provider.
    const modelId = resolved.info.id;
    const systemPrompt = input.systemPrompt?.trim() || conversation?.systemPrompt || settings.systemPrompt;
    const kind = input.kind === "agent" ? "agent" : "chat";
    const isNewConversation = !conversation;

    if (!conversation) {
      conversation = await store.createConversation({
        title: deriveTitle(message),
        model: modelId,
        systemPrompt: input.systemPrompt?.trim() || undefined,
      });
    } else {
      const patch: Partial<Pick<Conversation, "model" | "systemPrompt">> = {};
      if (conversation.model !== modelId) patch.model = modelId;
      if (input.systemPrompt?.trim() && conversation.systemPrompt !== input.systemPrompt.trim()) {
        patch.systemPrompt = input.systemPrompt.trim();
      }
      if (Object.keys(patch).length) {
        const updated = await store.updateConversation(conversation.id, patch);
        if (updated) conversation = updated;
      }
    }

    const userMessage = await store.addMessage({
      conversationId: conversation.id,
      role: "user",
      content: message,
      tokenEstimate: estimateTokens(message),
    });

    const state: RunState = {
      model: modelId,
      systemPrompt,
      temperature: clampTemperature(input.temperature ?? settings.temperature, settings.temperature),
      iteration: 0,
      pendingCalls: [],
      pendingIndex: 0,
      useTools: input.useTools ?? true,
    };

    const runId = createId("run");
    const run = await store.createRun({
      id: runId,
      conversationId: conversation.id,
      kind,
      status: "running",
      input: message,
      state,
    });

    const controller = new AbortController();
    activeRuns.set(runId, controller);

    await safeLog(store, {
      runId,
      conversationId: conversation.id,
      level: "info",
      event: "run_started",
      message: `Run started with ${resolved.info.label}.`,
      data: {
        provider: resolved.provider,
        model: modelId,
        kind,
        userMessageId: userMessage.id,
        supportsTools: resolved.info.supportsTools,
      },
    });

    const events = await runAgent({
      run,
      conversation,
      state,
      settings,
      isNewConversation,
      touchMemory: true,
      signal: controller.signal,
    });

    const baseEvents = (async function* (): AsyncGenerator<StreamEvent> {
      yield { type: "run", runId, conversationId: conversation!.id, kind };
      yield* events;
    })();

    return { runId, conversationId: conversation.id, events: baseEvents };
  }

  async function resumeRun(
    runId: string,
    decision: { approved: boolean; note?: string; toolCallId?: string },
  ): Promise<HarnessEventSource> {
    if (activeRuns.has(runId)) {
      throw new HarnessError("Run is already active.", { status: 409, code: "run_active" });
    }
    const run = await store.getRun(runId);
    if (!run) throw new HarnessError("Run not found.", { status: 404, code: "not_found" });
    if (run.status !== "awaiting_approval") {
      throw new HarnessError(
        `Run is not awaiting approval (status: ${run.status}).`,
        { status: 409, code: "run_not_awaiting_approval" },
      );
    }
    const pending = run.state.awaitingCall;
    if (!pending) {
      throw new HarnessError("Run has no pending approval request.", { status: 409, code: "no_pending_call" });
    }
    if (decision.toolCallId && decision.toolCallId !== pending.id) {
      throw new HarnessError("Approval does not match the pending tool call.", {
        status: 409,
        code: "approval_mismatch",
      });
    }
    const conversation = run.conversationId ? await store.getConversation(run.conversationId) : null;
    if (!conversation) throw new HarnessError("Conversation not found.", { status: 404, code: "not_found" });

    const state = run.state;
    if (decision.approved) {
      state.approvedCallId = pending.id;
    } else {
      state.deniedCallId = pending.id;
      state.denialNote = decision.note?.slice(0, 500);
    }
    state.awaitingCall = undefined;
    run.status = "running";
    await store.updateRun(runId, { status: "running", state });

    await safeLog(store, {
      runId,
      conversationId: conversation.id,
      level: decision.approved ? "info" : "warn",
      event: decision.approved ? "permission_granted" : "permission_denied",
      message: `${decision.approved ? "Approved" : "Denied"} ${pending.name}.`,
      data: { tool: pending.name, callId: pending.id, note: decision.note },
    });

    const controller = new AbortController();
    activeRuns.set(runId, controller);
    const settings = await settingsWithDefaults();

    const events = await runAgent({
      run,
      conversation,
      state,
      settings,
      isNewConversation: false,
      touchMemory: false,
      signal: controller.signal,
    });
    return { runId, conversationId: conversation.id, events };
  }

  async function cancelRun(runId: string): Promise<boolean> {
    const run = await store.getRun(runId);
    if (!run) return false;
    if (["completed", "cancelled", "failed"].includes(run.status)) return false;
    await store.updateRun(runId, { status: "cancelled" });
    const controller = activeRuns.get(runId);
    controller?.abort(new Error("Cancelled by user"));
    activeRuns.delete(runId);
    await safeLog(store, {
      runId,
      conversationId: run.conversationId,
      level: "warn",
      event: "cancel_requested",
      message: "Cancellation requested by user.",
    });
    return true;
  }

  async function updateSettings(patch: SettingsPatch): Promise<AppSettings> {
    const clean: SettingsPatch = {};
    if (typeof patch.defaultModel === "string" && patch.defaultModel.trim()) {
      const resolved = resolveModel(patch.defaultModel.trim(), providers);
      clean.defaultModel = resolved.info.id;
    }
    if (typeof patch.systemPrompt === "string") clean.systemPrompt = patch.systemPrompt.slice(0, 20_000);
    if (typeof patch.temperature === "number") {
      clean.temperature = clampTemperature(patch.temperature, 0.7);
    }
    if (typeof patch.maxIterations === "number") {
      clean.maxIterations = Math.max(1, Math.min(20, Math.round(patch.maxIterations)));
    }
    if (typeof patch.memoryEnabled === "boolean") clean.memoryEnabled = patch.memoryEnabled;
    if (typeof patch.memoryLimit === "number") {
      clean.memoryLimit = Math.max(1, Math.min(20, Math.round(patch.memoryLimit)));
    }
    if (typeof patch.toolsEnabled === "boolean") clean.toolsEnabled = patch.toolsEnabled;
    if (typeof patch.streamResponses === "boolean") clean.streamResponses = patch.streamResponses;
    if (patch.permissions && typeof patch.permissions === "object") {
      const current = (await settingsWithDefaults()).permissions;
      clean.permissions = {
        allowFileRead: Boolean(patch.permissions.allowFileRead ?? current.allowFileRead),
        allowFileWrite: Boolean(patch.permissions.allowFileWrite ?? current.allowFileWrite),
        allowShell: Boolean(patch.permissions.allowShell ?? current.allowShell),
        allowMemoryWrite: Boolean(patch.permissions.allowMemoryWrite ?? current.allowMemoryWrite),
        allowNetwork: Boolean(patch.permissions.allowNetwork ?? current.allowNetwork),
      };
    }
    return store.updateSettings(clean as Partial<AppSettings>);
  }

  return {
    config,
    store,
    startChat,
    resumeRun,
    cancelRun,
    listModels: async () => {
      const settings = await settingsWithDefaults();
      return listAllModels(providers, true, settings.defaultModel);
    },
    providerStatuses: async () => getProviderStatuses(config, providers),
    getSettings: settingsWithDefaults,
    updateSettings,
    toolInfos: async () => {
      const settings = await settingsWithDefaults();
      return tools.infos(settings);
    },
    getRun: (runId) => store.getRun(runId),
  };
}

let harnessPromise: Promise<Harness> | null = null;

export async function getHarness(): Promise<Harness> {
  if (!harnessPromise) {
    harnessPromise = (async () => {
      const store = await getStorage();
      return createHarness({ store });
    })().catch((error) => {
      harnessPromise = null;
      throw error;
    });
  }
  return harnessPromise;
}

export { PROVIDER_LABELS };


