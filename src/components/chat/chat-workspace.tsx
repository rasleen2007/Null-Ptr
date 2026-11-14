"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Brain,
  Cpu,
  History,
  Loader2,
  Menu,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import type { ModelInfo, ToolInfo } from "@/harness/types";
import { describeModelId } from "@/harness/providers/catalog";
import {
  apiGet,
  loadModels,
  type HealthResponse,
  type ModelsResponse,
  type SettingsResponse,
  type ToolsResponse,
} from "@/lib/api";
import { useChatSession, type PrivacyReport } from "@/lib/use-chat-session";
import { cn, formatNumber } from "@/lib/utils";
import { AIOrb } from "@/components/visual/ai-orb";
import { ThinkingIndicator } from "@/components/common/thinking-indicator";
import { StatusDot } from "@/components/common/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ConversationList } from "./conversation-sidebar";
import { Composer } from "./composer";
import { MessageBubble } from "./message-bubble";
import { PermissionCard } from "./permission-card";
import { ToolActivityList } from "./tool-activity";
import { VaultControl } from "@/components/vault/vault-control";

const CHAT_SUGGESTIONS = [
  "What can this harness do?",
  "Remember that I prefer concise answers",
  "Draft a focused plan for my day",
  "Explain how your tool approvals work",
];

const AGENT_SUGGESTIONS = [
  "Inspect this project and summarize its architecture",
  "Plan a small refactor, then wait for approval before writing",
  "Check my workspace files and report what you find",
];

function workspaceHeight() {
  return "h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)]";
}

function shortModel(id: string | undefined) {
  if (!id) return undefined;
  const parts = id.split(":");
  return parts.slice(1).join(":") || id;
}

function Welcome({
  mode,
  onSuggestion,
  disabled,
}: {
  mode: "chat" | "agent";
  onSuggestion: (text: string) => void;
  disabled: boolean;
}) {
  const suggestions = mode === "agent" ? AGENT_SUGGESTIONS : CHAT_SUGGESTIONS;
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
      <AIOrb size={mode === "agent" ? 150 : 168} state="idle" />
      <p className="eyebrow mt-7">{mode === "agent" ? "Autonomous workspace" : "Conversation channel"}</p>
      <h1 className="mt-2 max-w-lg text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">
        {mode === "agent" ? "Assign an objective. Watch it execute." : "How can I help you today?"}
      </h1>
      <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">
        {mode === "agent"
          ? "Jarvis plans across tools, pauses for sensitive actions, and reports every step in the trace."
          : "Chat with live streaming, persistent memory, and tool access — all under your control."}
      </p>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            disabled={disabled}
            className="group flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5 text-left text-[0.72rem] text-slate-400 transition-all hover:border-cyan-400/25 hover:bg-cyan-400/[0.04] hover:text-slate-200 disabled:opacity-40"
          >
            <span>{suggestion}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-300" />
          </button>
        ))}
      </div>
    </div>
  );
}

function StatusPill({ session }: { session: ReturnType<typeof useChatSession> }) {
  const label = session.awaitingApproval
    ? "Awaiting approval"
    : session.isStreaming
      ? "Running"
      : session.error
        ? "Error"
        : "Ready";
  const tone = session.awaitingApproval
    ? "warning"
    : session.isStreaming
      ? "busy"
      : session.error
        ? "offline"
        : "online";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[0.58rem] uppercase tracking-[0.16em] text-slate-400">
      <StatusDot tone={tone} pulse={tone !== "offline"} />
      {label}
    </span>
  );
}

function AgentPanel({
  session,
  tools,
  health,
}: {
  session: ReturnType<typeof useChatSession>;
  tools: ToolInfo[];
  health: HealthResponse | null;
}) {
  const enabledTools = tools.filter((tool) => tool.enabled);
  const maxIterations = session.iteration?.maxIterations ?? health?.limits.maxIterations ?? 6;
  const iteration = session.iteration?.iteration ?? 0;
  const sensitiveCount = enabledTools.filter((tool) => tool.sensitivity === "sensitive").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="glass p-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">Run telemetry</p>
          <StatusPill session={session} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[0.52rem] uppercase tracking-[0.16em] text-slate-600">Iteration</p>
            <p className="mt-1 font-mono text-sm text-cyan-200">
              {iteration}
              <span className="text-slate-600">/{maxIterations}</span>
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[0.52rem] uppercase tracking-[0.16em] text-slate-600">Tool calls</p>
            <p className="mt-1 font-mono text-sm text-cyan-200">{session.toolActivity.length}</p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[0.52rem] uppercase tracking-[0.16em] text-slate-600">Prompt tok</p>
            <p className="mt-1 font-mono text-sm text-slate-300">
              {session.usage?.promptTokens ? formatNumber(session.usage.promptTokens) : "—"}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[0.52rem] uppercase tracking-[0.16em] text-slate-600">Output tok</p>
            <p className="mt-1 font-mono text-sm text-slate-300">
              {session.usage?.completionTokens ? formatNumber(session.usage.completionTokens) : "—"}
            </p>
          </div>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500"
            style={{ width: `${Math.min(100, maxIterations ? (iteration / maxIterations) * 100 : 0)}%` }}
          />
        </div>
      </div>

      <div className="glass flex min-h-[180px] flex-1 flex-col p-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">Execution trace</p>
          <Brain className="h-3.5 w-3.5 text-slate-600" />
        </div>
        <div className="mt-3 flex-1 space-y-2 overflow-y-auto scrollbar-thin">
          {session.thinking.length ? (
            session.thinking.map((line, index) => (
              <div key={`${index}-${line.slice(0, 12)}`} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-cyan-400/70" />
                <p className="text-[0.68rem] leading-relaxed text-slate-400">{line}</p>
              </div>
            ))
          ) : null}
          {session.toolActivity.length ? <ToolActivityList activities={session.toolActivity} /> : null}
          {!session.thinking.length && !session.toolActivity.length ? (
            <p className="py-6 text-center text-[0.66rem] text-slate-600">
              Trace appears here while the agent reasons and acts.
            </p>
          ) : null}
        </div>
      </div>

      <div className="glass p-4">
        <div className="flex items-center justify-between">
          <p className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">Execution policy</p>
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
        </div>
        <div className="mt-3 space-y-1.5 text-[0.65rem] text-slate-400">
          <div className="flex items-center justify-between">
            <span>Armed tools</span>
            <span className="font-mono text-slate-300">{enabledTools.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Gated tools</span>
            <span className="font-mono text-amber-300/90">{sensitiveCount}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Shell access</span>
            <span className={health?.safety.shellEnabled ? "text-amber-300/90" : "text-emerald-300/90"}>
              {health ? (health.safety.shellEnabled ? "armed" : "disabled") : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Iteration cap</span>
            <span className="font-mono text-slate-300">{maxIterations}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Tool timeout</span>
            <span className="font-mono text-slate-300">
              {health ? `${Math.round(health.limits.toolTimeoutMs / 1000)}s` : "—"}
            </span>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {enabledTools.slice(0, 8).map((tool) => (
            <span
              key={tool.name}
              className={cn(
                "rounded-md border px-1.5 py-0.5 font-mono text-[0.55rem]",
                tool.sensitivity === "sensitive"
                  ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200/80"
                  : "border-white/[0.07] bg-white/[0.02] text-slate-500",
              )}
            >
              {tool.name}
            </span>
          ))}
        </div>
        <Link
          href="/tools"
          className="mt-3 inline-flex items-center gap-1 text-[0.62rem] text-cyan-300/80 hover:text-cyan-200"
        >
          Manage tools <ArrowRight className="h-2.5 w-2.5" />
        </Link>
      </div>
    </div>
  );
}

const PII_TYPE_LABEL: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  phone: "phone",
  email: "email",
  ifsc: "IFSC",
  upi: "UPI",
  account: "account",
  dob: "date of birth",
  address: "address",
  name: "name",
  other: "other",
};

function PrivacySummary({ privacy }: { privacy: PrivacyReport }) {
  const placeholders = privacy.placeholders.slice(0, 6);
  const remaining = privacy.placeholders.length - placeholders.length;
  const types = [...new Set(privacy.types)];
  const local = privacy.route === "ollama";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.03] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-[0.6rem]">
        <span className="inline-flex items-center gap-1 font-medium text-emerald-200/90">
          <ShieldCheck className="h-3 w-3" /> Privacy guard
        </span>
        {privacy.redacted ? (
          <span className="text-slate-400">
            {privacy.placeholders.length} identifier
            {privacy.placeholders.length === 1 ? "" : "s"} replaced with placeholders
          </span>
        ) : (
          <span className="text-slate-500">No personal identifiers detected in this turn</span>
        )}
        {local ? (
          <Badge variant="warning" className="px-1.5 py-0 text-[0.5rem] uppercase tracking-wide">
            <Cpu className="h-2.5 w-2.5" /> local model only
          </Badge>
        ) : (
          <Badge
            variant={privacy.verifiedClean ? "success" : "danger"}
            className="px-1.5 py-0 text-[0.5rem] uppercase tracking-wide"
          >
            {privacy.verifiedClean ? "cloud · placeholders only" : "residual PII detected"}
          </Badge>
        )}
        {!local && !privacy.verifiedClean ? (
          <AlertTriangle className="h-3 w-3 text-rose-300" />
        ) : null}
      </div>

      {placeholders.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {placeholders.map((placeholder) => (
            <code
              key={placeholder}
              className="rounded border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 font-mono text-[0.55rem] text-cyan-200/80"
            >
              {placeholder}
            </code>
          ))}
          {remaining > 0 ? (
            <span className="text-[0.55rem] text-slate-500">+{remaining} more</span>
          ) : null}
        </div>
      ) : null}

      {types.length ? (
        <p className="mt-1 text-[0.55rem] text-slate-600">
          {types.map((type) => PII_TYPE_LABEL[type] ?? type).join(" · ")}
        </p>
      ) : null}

      {local ? (
        <p className="mt-1 text-[0.55rem] leading-relaxed text-amber-200/60">
          Unknown personal data was detected, so this turn stayed on the local model. Nothing was
          sent to a cloud provider.
        </p>
      ) : null}
    </motion.div>
  );
}

export function ChatWorkspace({ mode }: { mode: "chat" | "agent" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialConversation = searchParams.get("conversation") ?? undefined;
  const initialPrompt = searchParams.get("prompt") ?? undefined;
  const initialModel = searchParams.get("model") ?? undefined;

  const [historyVersion, setHistoryVersion] = useState(0);
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState("");
  const [input, setInput] = useState("");
  const [useTools, setUseTools] = useState(true);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [globalSystemPrompt, setGlobalSystemPrompt] = useState("");
  const [systemOpen, setSystemOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScrollRef = useRef(true);
  const bootedConversationRef = useRef(false);
  const promptSentRef = useRef(false);
  const appliedConversationRef = useRef<string | undefined>(undefined);

  const session = useChatSession({
    mode,
    onRunComplete: () => setHistoryVersion((value) => value + 1),
  });

  const { send, loadConversation } = session;

  useEffect(() => {
    let active = true;
    void loadModels()
      .then((data) => {
        if (active) setModelsData(data);
      })
      .catch((error: Error) => {
        if (active) setModelsError(error.message);
      });
    void apiGet<SettingsResponse>("/api/settings")
      .then((data) => {
        if (active) setGlobalSystemPrompt(data.settings.systemPrompt);
      })
      .catch(() => undefined);
    if (mode === "agent") {
      void apiGet<ToolsResponse>("/api/tools")
        .then((data) => {
          if (active) setTools(data.tools);
        })
        .catch(() => undefined);
      void apiGet<HealthResponse>("/api/health")
        .then((data) => {
          if (active) setHealth(data);
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [mode]);

  const availableModels = useMemo(() => {
    if (!modelsData) return [] as ModelInfo[];
    const byId = new Map(modelsData.providers.map((provider) => [provider.id, provider]));
    const list = modelsData.models.filter((model) => {
      if (model.provider === "ollama") return true;
      return Boolean(byId.get(model.provider)?.configured);
    });
    // Keep a conversation's custom model selectable even if it is not the
    // current default and therefore not part of the server model list.
    const conversationModel = session.conversation?.model;
    if (conversationModel && !list.some((model) => model.id === conversationModel)) {
      const info = describeModelId(conversationModel);
      if (
        info &&
        (info.provider === "ollama" || Boolean(byId.get(info.provider)?.configured))
      ) {
        list.push(info);
      }
    }
    return list;
  }, [modelsData, session.conversation?.model]);

  const selectedInfo = availableModels.find((model) => model.id === selectedModel);
  const toolsSupported = selectedInfo?.supportsTools ?? false;

  useEffect(() => {
    if (!modelsData) return;
    if (selectedModel && availableModels.some((model) => model.id === selectedModel)) return;
    const preferred = [initialModel, session.conversation?.model, modelsData.defaultModel].filter(
      (item): item is string => Boolean(item),
    );
    const next =
      preferred.map((id) => availableModels.find((model) => model.id === id)).find(Boolean) ??
      availableModels[0];
    if (next) setSelectedModel(next.id);
  }, [availableModels, initialModel, modelsData, selectedModel, session.conversation?.model]);

  useEffect(() => {
    const conversation = session.conversation;
    if (!conversation || appliedConversationRef.current === conversation.id) return;
    appliedConversationRef.current = conversation.id;
    if (availableModels.some((model) => model.id === conversation.model)) {
      setSelectedModel(conversation.model);
    }
    setSystemPrompt(conversation.systemPrompt ?? "");
  }, [availableModels, session.conversation]);

  useEffect(() => {
    if (!initialConversation || bootedConversationRef.current) return;
    bootedConversationRef.current = true;
    void loadConversation(initialConversation);
  }, [initialConversation, loadConversation]);

  useEffect(() => {
    if (!initialPrompt || promptSentRef.current) return;
    if (!modelsData || !selectedModel) return;
    promptSentRef.current = true;
    router.replace(mode === "agent" ? "/agent" : "/chat");
    void (async () => {
      if (initialConversation && session.conversationId !== initialConversation) {
        await loadConversation(initialConversation);
      }
      const supportsTools = availableModels.find((model) => model.id === selectedModel)?.supportsTools ?? false;
      await send(initialPrompt, {
        conversationId: initialConversation ?? session.conversationId,
        model: selectedModel,
        systemPrompt: systemPrompt.trim() || undefined,
        useTools: useTools && supportsTools,
      });
    })();
  }, [
    availableModels,
    initialConversation,
    initialPrompt,
    loadConversation,
    mode,
    modelsData,
    router,
    selectedModel,
    send,
    session.conversationId,
    systemPrompt,
    useTools,
  ]);

  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !autoScrollRef.current) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: session.isStreaming ? "auto" : "smooth",
    });
  }, [
    session.isStreaming,
    session.liveText,
    session.messages,
    session.permission,
    session.status,
    session.thinking,
    session.toolActivity,
  ]);

  const visibleMessages = session.messages.filter(
    (message) => message.role === "user" || message.role === "assistant",
  );

  const handleScroll = useCallback(() => {
    const node = scrollRef.current;
    if (!node) return;
    autoScrollRef.current = node.scrollHeight - node.scrollTop - node.clientHeight < 140;
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !selectedModel) return;
      setInput("");
      await send(trimmed, {
        model: selectedModel,
        systemPrompt: systemPrompt.trim() || undefined,
        useTools: useTools && toolsSupported,
      });
    },
    [selectedModel, send, systemPrompt, toolsSupported, useTools],
  );

  const handleSend = useCallback(() => {
    void sendText(input);
  }, [input, sendText]);

  const handleNew = useCallback(() => {
    session.newConversation();
    setInput("");
    setSystemPrompt("");
    setHistoryOpen(false);
    appliedConversationRef.current = undefined;
  }, [session]);

  const handleSelect = useCallback(
    (id: string) => {
      setHistoryOpen(false);
      void session.loadConversation(id);
    },
    [session],
  );

  const handleSuggestion = useCallback(
    (text: string) => {
      void sendText(text);
    },
    [sendText],
  );

  const conversationTitle = session.conversation?.title ?? (mode === "agent" ? "New objective" : "New conversation");
  const showWelcome = !visibleMessages.length && !session.liveText && !session.isStreaming && !session.loadingConversation;

  return (
    <div className={cn("p-2 sm:p-3 lg:p-4", workspaceHeight())}>
      <div className="mx-auto flex h-full w-full max-w-[1600px] gap-3">
        {mode === "chat" ? (
          <div className="glass hidden w-[272px] shrink-0 overflow-hidden lg:block">
            <ConversationList
              currentId={session.conversationId}
              refreshKey={historyVersion}
              onSelect={handleSelect}
              onNew={handleNew}
              onDeleted={(id) => {
                if (id === session.conversationId) handleNew();
              }}
            />
          </div>
        ) : null}

        <div className="glass flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.05] bg-white/[0.01] px-3 py-2.5 sm:px-4">
            {mode === "chat" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 lg:hidden"
                onClick={() => setHistoryOpen(true)}
                aria-label="Conversation history"
              >
                <Menu className="h-4 w-4" />
              </Button>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300">
                <Terminal className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[0.82rem] font-medium text-slate-200">{conversationTitle}</h2>
                {mode === "agent" ? (
                  <Badge variant="violet" className="hidden px-1.5 py-0 text-[0.52rem] sm:inline-flex">
                    agent loop
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[0.58rem] uppercase tracking-[0.16em] text-slate-600">
                {selectedModel ? shortModel(selectedModel) : modelsError ? "model registry offline" : "no model selected"}
                {visibleMessages.length ? ` · ${visibleMessages.length} messages` : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <VaultControl />
              <div className="hidden sm:block">
                <StatusPill session={session} />
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-1.5"
              onClick={handleNew}
              title={mode === "agent" ? "New objective" : "New conversation"}
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{mode === "agent" ? "New objective" : "New"}</span>
            </Button>
          </div>

          {mode === "agent" ? (
            <div className="flex items-center gap-3 border-b border-white/[0.04] bg-white/[0.01] px-3 py-1.5 text-[0.58rem] text-slate-500 xl:hidden">
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="h-3 w-3" /> loop {session.iteration?.iteration ?? 0}/
                {session.iteration?.maxIterations ?? 6}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Wrench className="h-3 w-3" /> {session.toolActivity.length} tools
              </span>
              <span className="ml-auto uppercase tracking-[0.14em]">{session.awaitingApproval ? "paused" : session.isStreaming ? "running" : "ready"}</span>
            </div>
          ) : null}

          <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
              {session.loadingConversation ? (
                <div className="space-y-5 py-6">
                  <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-white/[0.03]" />
                  <div className="ml-auto h-20 w-1/2 animate-pulse rounded-2xl bg-white/[0.03]" />
                  <div className="h-28 w-3/4 animate-pulse rounded-2xl bg-white/[0.03]" />
                </div>
              ) : showWelcome ? (
                <Welcome mode={mode} onSuggestion={handleSuggestion} disabled={!selectedModel} />
              ) : (
                <div className="space-y-6">
                  {visibleMessages.map((message) => (
                    <MessageBubble
                      key={message.id}
                      message={message}
                      modelLabel={message.role === "assistant" ? shortModel(message.model) : undefined}
                    />
                  ))}

                  <AnimatePresence initial={false}>
                    {session.toolActivity.length ? (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                      >
                        <ToolActivityList activities={session.toolActivity} />
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  {session.thinking.length && !session.liveText ? (
                    <ThinkingIndicator
                      label={mode === "agent" ? "Executing plan" : "Reasoning"}
                      detail={session.thinking[session.thinking.length - 1]}
                    />
                  ) : null}

                  {session.liveText ? (
                    <MessageBubble
                      message={{
                        id: "live",
                        conversationId: session.conversationId ?? "pending",
                        role: "assistant",
                        content: session.liveText,
                        model: selectedModel,
                        createdAt: new Date().toISOString(),
                      }}
                      streaming
                      showCursor={session.isStreaming}
                      modelLabel={shortModel(selectedModel)}
                    />
                  ) : session.isStreaming && !session.thinking.length && !session.toolActivity.length ? (
                    <ThinkingIndicator label="Jarvis is thinking" detail="Connecting to the model…" />
                  ) : null}

                  {session.error ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-400/[0.05] px-3.5 py-2.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-300" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.7rem] font-medium text-rose-200">Run error</p>
                        <p className="mt-0.5 break-words text-[0.68rem] leading-relaxed text-rose-200/70">{session.error}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => session.setError(null)}
                        className="rounded p-0.5 text-rose-300/60 hover:text-rose-200"
                        aria-label="Dismiss error"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-white/[0.05] bg-[#040b18]/50 p-2.5 sm:p-3">
            <div className="mx-auto w-full max-w-3xl space-y-2">
              <AnimatePresence>
                {session.permission ? (
                  <PermissionCard
                    request={session.permission}
                    onDecision={(approved, note) => session.respondToPermission(approved, note)}
                  />
                ) : null}
              </AnimatePresence>
              {session.privacy ? <PrivacySummary privacy={session.privacy} /> : null}
              <Composer
                value={input}
                onChange={setInput}
                onSend={handleSend}
                onStop={() => void session.stop()}
                streaming={session.isStreaming}
                disabled={session.awaitingApproval}
                models={availableModels}
                providers={modelsData?.providers ?? []}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                useTools={useTools}
                onUseToolsChange={setUseTools}
                toolsSupported={toolsSupported}
                onOpenSystemPrompt={() => setSystemOpen(true)}
                systemPromptActive={Boolean(systemPrompt.trim())}
                placeholder={
                  mode === "agent"
                    ? "Describe an objective for the agent…"
                    : "Message Jarvis… (Enter to send, Shift+Enter for newline)"
                }
                footer={
                  session.usage?.completionTokens || session.usage?.promptTokens ? (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Activity className="h-2.5 w-2.5" />
                      {formatNumber((session.usage.promptTokens ?? 0) + (session.usage.completionTokens ?? 0))} tok
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" /> approval-gated execution
                    </span>
                  )
                }
              />
              {toolsSupported ? null : selectedModel ? (
                <p className="px-1 text-[0.58rem] text-amber-300/60">This model does not support tool calling.</p>
              ) : null}
              {modelsError ? (
                <p className="px-1 text-[0.58rem] text-rose-300/70">{modelsError}</p>
              ) : null}
            </div>
          </div>
        </div>

        {mode === "agent" ? (
          <aside className="hidden w-[318px] shrink-0 flex-col overflow-y-auto scrollbar-thin xl:flex">
            <AgentPanel session={session} tools={tools} health={health} />
          </aside>
        ) : null}
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-white/[0.06] px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4 text-cyan-300" /> Conversation history
            </DialogTitle>
          </DialogHeader>
          <div className="h-[62vh]">
            <ConversationList
              currentId={session.conversationId}
              refreshKey={historyVersion}
              onSelect={handleSelect}
              onNew={handleNew}
              onDeleted={(id) => {
                if (id === session.conversationId) handleNew();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={systemOpen} onOpenChange={setSystemOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-violet-300" /> System instruction
            </DialogTitle>
            <DialogDescription>
              Shapes how Jarvis responds. Leave blank to use the global instruction from Settings.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder={globalSystemPrompt || "You are JARVIS…"}
            className="min-h-[180px] text-xs leading-relaxed"
            maxLength={20000}
          />
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="flex items-center gap-1.5 text-[0.58rem] uppercase tracking-[0.16em] text-slate-500">
              <Sparkles className="h-2.5 w-2.5" /> Global default
            </p>
            <p className="mt-1 line-clamp-3 text-[0.65rem] leading-relaxed text-slate-500">
              {globalSystemPrompt || "Loading global instruction…"}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setSystemPrompt("");
                setSystemOpen(false);
              }}
            >
              Use global default
            </Button>
            <Button onClick={() => setSystemOpen(false)}>Save instruction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ChatWorkspaceSkeleton() {
  return (
    <div className={cn("p-2 sm:p-3 lg:p-4", workspaceHeight())}>
      <div className="glass flex h-full items-center justify-center rounded-2xl">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
          <p className="text-xs uppercase tracking-[0.2em]">Initializing workspace</p>
        </div>
      </div>
    </div>
  );
}
