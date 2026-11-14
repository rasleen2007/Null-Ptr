"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Conversation,
  RunStatus,
  StoredMessage,
  StreamEvent,
  ToolCall,
  ToolCategory,
  ToolInfo,
  ToolSensitivity,
} from "@/harness/types";
import {
  apiGet,
  apiSend,
  streamChatRequest,
  type ChatRequestBody,
  type ConversationDetail,
} from "@/lib/api";

export interface ToolActivity {
  call: ToolCall;
  sensitivity: ToolSensitivity;
  category?: ToolCategory;
  result?: string;
  isError?: boolean;
}

export interface PermissionRequest {
  runId: string;
  call: ToolCall;
  tool: ToolInfo;
  reason: string;
}

export type SessionStatus = "idle" | "streaming" | "awaiting" | "error";

export interface SendOptions {
  conversationId?: string;
  model?: string;
  systemPrompt?: string;
  temperature?: number;
  useTools?: boolean;
}

export interface UseChatSessionOptions {
  mode: "chat" | "agent";
  onConversationChange?: (conversationId: string | undefined) => void;
  onRunComplete?: () => void;
}

let localId = 0;
function optimisticMessage(
  conversationId: string,
  role: StoredMessage["role"],
  content: string,
): StoredMessage {
  localId += 1;
  return {
    id: `local_${localId}`,
    conversationId,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function useChatSession(options: UseChatSessionOptions) {
  const { mode, onConversationChange, onRunComplete } = options;
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [liveText, setLiveText] = useState("");
  const [thinking, setThinking] = useState<string[]>([]);
  const [toolActivity, setToolActivity] = useState<ToolActivity[]>([]);
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [iteration, setIteration] = useState<{ iteration: number; maxIterations: number } | null>(null);
  const [usage, setUsage] = useState<{ promptTokens?: number; completionTokens?: number } | null>(null);
  const [status, setStatus] = useState<SessionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [loadingConversation, setLoadingConversation] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const conversationRef = useRef<string | undefined>(undefined);
  const runRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const setConversationIdSafe = useCallback(
    (id: string | undefined) => {
      conversationRef.current = id;
      setConversationId(id);
      onConversationChange?.(id);
    },
    [onConversationChange],
  );

  const handleEvent = useCallback(
    (event: StreamEvent) => {
      if (!mountedRef.current) return;
      switch (event.type) {
        case "run":
          runRef.current = event.runId;
          setRunId(event.runId);
          conversationRef.current = event.conversationId;
          setConversationId(event.conversationId);
          onConversationChange?.(event.conversationId);
          break;
        case "title":
          setConversation((current) =>
            current ? { ...current, title: event.title } : current,
          );
          break;
        case "iteration":
          setIteration({ iteration: event.iteration, maxIterations: event.maxIterations });
          break;
        case "thinking":
          setThinking((prev) => [...prev, event.message]);
          break;
        case "delta":
          setLiveText((prev) => prev + event.text);
          break;
        case "tool_call":
          setToolActivity((prev) => {
            if (prev.some((item) => item.call.id === event.call.id)) return prev;
            return [
              ...prev,
              {
                call: event.call,
                sensitivity: event.sensitivity,
                category: event.category,
              },
            ];
          });
          break;
        case "tool_result":
          setToolActivity((prev) =>
            prev.map((item) =>
              item.call.id === event.call.id
                ? { ...item, result: event.content, isError: event.isError }
                : item,
            ),
          );
          break;
        case "permission_request":
          runRef.current = event.runId;
          setRunId(event.runId);
          setPermission({
            runId: event.runId,
            call: event.call,
            tool: event.tool,
            reason: event.reason,
          });
          setStatus("awaiting");
          break;
        case "usage":
          setUsage({ promptTokens: event.promptTokens, completionTokens: event.completionTokens });
          break;
        case "error":
          setError(event.message);
          break;
        case "done":
          if (event.status === "awaiting_approval") setStatus("awaiting");
          else if (event.status === "failed") setStatus("error");
          else setStatus("idle");
          break;
        default:
          break;
      }
    },
    [onConversationChange],
  );

  const refreshConversation = useCallback(async (id: string) => {
    try {
      const detail = await apiGet<ConversationDetail>(`/api/conversations/${id}`);
      if (!mountedRef.current) return;
      setConversation(detail.conversation);
      setMessages(detail.messages);
    } catch {
      // Conversation might have been deleted while streaming.
    }
  }, []);

  const loadConversation = useCallback(
    async (id: string) => {
      abortRef.current?.abort();
      setLoadingConversation(true);
      setError(null);
      try {
        const detail = await apiGet<ConversationDetail>(`/api/conversations/${id}`);
        setConversation(detail.conversation);
        setMessages(detail.messages);
        setConversationIdSafe(id);
        resetTransient();
      } catch (loadError) {
        setError((loadError as Error).message);
      } finally {
        setLoadingConversation(false);
      }
    },
    [setConversationIdSafe],
  );

  const resetTransient = () => {
    setLiveText("");
    setThinking([]);
    setToolActivity([]);
    setPermission(null);
    setIteration(null);
    setUsage(null);
    setRunId(null);
    runRef.current = null;
    setStatus("idle");
  };

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setConversation(null);
    setMessages([]);
    setConversationIdSafe(undefined);
    setError(null);
    resetTransient();
  }, [setConversationIdSafe]);

  const finishStream = useCallback(
    async (targetConversation?: string) => {
      if (targetConversation) await refreshConversation(targetConversation);
      if (!mountedRef.current) return;
      setLiveText("");
      setThinking([]);
      setToolActivity([]);
      setIteration(null);
      onRunComplete?.();
    },
    [onRunComplete, refreshConversation],
  );

  const send = useCallback(
    async (message: string, sendOptions: SendOptions = {}) => {
      if (!message.trim() || status === "streaming") return;
      setError(null);
      setLiveText("");
      setThinking([]);
      setToolActivity([]);
      setPermission(null);
      setUsage(null);
      setIteration(null);

      const targetConversation = sendOptions.conversationId ?? conversationRef.current;
      setMessages((prev) => [
        ...prev,
        optimisticMessage(targetConversation ?? "pending", "user", message),
      ]);
      setStatus("streaming");

      const controller = new AbortController();
      abortRef.current = controller;
      const body: ChatRequestBody = {
        message,
        conversationId: targetConversation,
        model: sendOptions.model,
        systemPrompt: sendOptions.systemPrompt,
        temperature: sendOptions.temperature,
        kind: mode,
        useTools: sendOptions.useTools ?? true,
      };

      try {
        await streamChatRequest("/api/chat", body, controller.signal, handleEvent);
        await finishStream(conversationRef.current);
      } catch (streamError) {
        if ((streamError as Error).name !== "AbortError") {
          setError((streamError as Error).message);
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
        if (mountedRef.current) {
          setStatus((current) => (current === "awaiting" ? "awaiting" : current === "error" ? "error" : "idle"));
        }
      }
    },
    [finishStream, handleEvent, mode, status],
  );

  const respondToPermission = useCallback(
    async (approved: boolean, note?: string) => {
      if (!permission) return;
      const current = permission;
      setPermission(null);
      setStatus("streaming");
      setError(null);
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        await streamChatRequest(
          `/api/runs/${current.runId}/resume`,
          { approved, note, toolCallId: current.call.id },
          controller.signal,
          handleEvent,
        );
        await finishStream(conversationRef.current);
      } catch (streamError) {
        if ((streamError as Error).name !== "AbortError") {
          setError((streamError as Error).message);
          setStatus("error");
        }
      } finally {
        abortRef.current = null;
        if (mountedRef.current) {
          setStatus((value) => (value === "awaiting" ? "awaiting" : value === "error" ? "error" : "idle"));
        }
      }
    },
    [finishStream, handleEvent, permission],
  );

  const stop = useCallback(async () => {
    const activeRun = runRef.current;
    if (activeRun) {
      await apiSend(`/api/runs/${activeRun}/cancel`, "POST").catch(() => undefined);
    }
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setPermission(null);
    setThinking([]);
    if (conversationRef.current) {
      void refreshConversation(conversationRef.current);
      setLiveText("");
    }
  }, [refreshConversation]);

  const deleteConversation = useCallback(
    async (id: string) => {
      await apiSend(`/api/conversations/${id}`, "DELETE");
      if (conversationRef.current === id) newConversation();
    },
    [newConversation],
  );

  return {
    mode,
    conversationId,
    conversation,
    messages,
    liveText,
    thinking,
    toolActivity,
    permission,
    iteration,
    usage,
    status,
    error,
    runId,
    loadingConversation,
    send,
    stop,
    respondToPermission,
    loadConversation,
    refreshConversation,
    newConversation,
    deleteConversation,
    setError,
    isStreaming: status === "streaming",
    awaitingApproval: status === "awaiting",
  };
}

export type ChatSession = ReturnType<typeof useChatSession>;

export type { RunStatus };
