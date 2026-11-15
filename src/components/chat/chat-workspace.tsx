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
import { useChatSession, type PrivacyReport, type ToolActivity } from "@/lib/use-chat-session";
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
import { MemoryRecallPills } from "./memory-recall-pills";
import { DocumentCardList } from "./document-card";

const SARKARI_SUGGESTIONS = [
  "Mere liye suitable government schemes batao",
  "Mujhe RTI application draft karni hai",
  "Mujhe ek government form fill karna hai",
  "Mujhe kisi government service ki information chahiye",
  "What schemes am I eligible for in Maharashtra?",
  "Draft an RTI for pending passport application",
];

function workspaceHeight() {
  return "h-[calc(100dvh-8rem)] lg:h-[calc(100dvh-4rem)]";
}

function shortModel(id: string | undefined) {
  if (!id) return undefined;
  const parts = id.split(":");
  return parts.slice(1).join(":") || id;
}

interface GeneratedDocument {
  type: "rti" | "pdf";
  title: string;
  path: string;
  preview?: string;
  bytes?: number;
  language?: string;
}

function generatedDocuments(activities: ToolActivity[]): GeneratedDocument[] {
  const documents: GeneratedDocument[] = [];
  for (const activity of activities) {
    if (activity.isError || !activity.result) continue;
    const name = activity.call.name;
    if (name !== "rti_draft" && name !== "form_fill") continue;
    try {
      const parsed = JSON.parse(activity.result) as {
        path?: string;
        bytes?: number;
        preview?: string;
        language?: string;
        written?: boolean;
      };
      if (!parsed.path || parsed.written === false) continue;
      documents.push({
        type: name === "rti_draft" ? "rti" : "pdf",
        title: parsed.path.split(/[\\/]/).pop() || "Generated document",
        path: parsed.path,
        preview: parsed.preview,
        bytes: parsed.bytes,
        language: parsed.language,
      });
    } catch {
      // Tool results that are not JSON (for example a plain error) are ignored.
    }
  }
  return documents;
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
  const suggestions = SARKARI_SUGGESTIONS;
  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10 text-center">
      <AIOrb size={168} state="idle" />
      <p className="eyebrow mt-7">Your Government Services Assistant</p>
      <h1 className="mt-2 max-w-lg text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
        Namaste! Main Sarkari Saathi hoon.
      </h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-600">
        Main aapki government schemes, RTI applications aur official forms mein madad kar sakta hoon.
        Aap bataiye, aaj aapko kis kaam mein madad chahiye?
      </p>
      <div className="mt-6 grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            disabled={disabled}
            className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm text-slate-600 transition-all hover:border-indigo-300 hover:bg-indigo-50 hover:text-slate-900 disabled:opacity-40"
          >
            <span>{suggestion}</span>
            <ArrowRight className="h-3 w-3 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-indigo-600" />
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
      ? "Generating..."
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
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[0.6rem] uppercase tracking-[0.16em] text-slate-600">
      <StatusDot tone={tone} pulse={tone !== "offline"} />
      {label}
    </span>
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
      className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-[0.6rem]">
        <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
          <ShieldCheck className="h-3 w-3" /> Privacy guard
        </span>
        {privacy.redacted ? (
          <span className="text-slate-600">
            {privacy.placeholders.length} identifier
            {privacy.placeholders.length === 1 ? "" : "s"} replaced with placeholders
          </span>
        ) : (
          <span className="text-slate-500">No personal identifiers detected in this turn</span>
        )}
        {local ? (
          <Badge variant="secondary" className="px-1.5 py-0 text-[0.5rem] uppercase tracking-wide">
            <Cpu className="h-2.5 w-2.5" /> Local model only
          </Badge>
        ) : (
          <Badge
            variant={privacy.verifiedClean ? "success" : "danger"}
            className="px-1.5 py-0 text-[0.5rem] uppercase tracking-wide"
          >
            {privacy.verifiedClean ? "Cloud · placeholders only" : "Residual PII detected"}
          </Badge>
        )}
        {!local && !privacy.verifiedClean ? (
          <AlertTriangle className="h-3 w-3 text-rose-500" />
        ) : null}
      </div>

      {placeholders.length ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {placeholders.map((placeholder) => (
            <code
              key={placeholder}
              className="rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 font-mono text-[0.55rem] text-indigo-700"
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
        <p className="mt-1 text-[0.55rem] text-slate-500">
          {types.map((type) => PII_TYPE_LABEL[type] ?? type).join(" · ")}
        </p>
      ) : null}

      {local ? (
        <p className="mt-1 text-[0.55rem] leading-relaxed text-amber-700">
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
    router.replace("/chat");
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
  const documents = generatedDocuments(session.toolActivity);

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

  const conversationTitle = session.conversation?.title ?? "New conversation";
  const showWelcome = !visibleMessages.length && !session.liveText && !session.isStreaming && !session.loadingConversation;

  return (
    <div className={cn("p-2 sm:p-3 lg:p-4", workspaceHeight())}>
      <div className="mx-auto flex h-full w-full max-w-[1600px] gap-3">
        <div className="hidden w-[280px] shrink-0 overflow-hidden lg:block">
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

        <div className="surface flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2.5 sm:px-4">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 lg:hidden"
              onClick={() => setHistoryOpen(true)}
              aria-label="Conversation history"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-medium text-slate-900">{conversationTitle}</h2>
              </div>
              <p className="mt-0.5 truncate text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
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
              title="New conversation"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
          </div>

          <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
            <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
              {session.loadingConversation ? (
                <div className="space-y-5 py-6">
                  <div className="h-12 w-2/3 animate-pulse rounded-xl bg-slate-100" />
                  <div className="ml-auto h-20 w-1/2 animate-pulse rounded-xl bg-slate-100" />
                  <div className="h-28 w-3/4 animate-pulse rounded-xl bg-slate-100" />
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

                  {documents.length ? <DocumentCardList documents={documents} /> : null}

                  {session.thinking.length && !session.liveText ? (
                    <ThinkingIndicator
                      label="Sarkari Saathi is thinking"
                      detail={session.thinking[session.thinking.length - 1]}
                    />
                  ) : null}

                  {session.memoryRecall ? (
                    <MemoryRecallPills memories={session.memoryRecall.memories} />
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
                    <ThinkingIndicator label="Sarkari Saathi is thinking" detail="Connecting to the model…" />
                  ) : null}

                  {session.error ? (
                    <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-rose-700">Run error</p>
                        <p className="mt-0.5 break-words text-sm leading-relaxed text-rose-600">{session.error}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => session.setError(null)}
                        className="rounded p-0.5 text-rose-400 hover:text-rose-600"
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

          <div className="border-t border-slate-200 bg-slate-50/50 p-2.5 sm:p-3">
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
                placeholder="Message Sarkari Saathi… (Enter to send, Shift+Enter for newline)"
                footer={
                  session.usage?.completionTokens || session.usage?.promptTokens ? (
                    <span className="inline-flex items-center gap-1 font-mono">
                      <Activity className="h-2.5 w-2.5" />
                      {formatNumber((session.usage.promptTokens ?? 0) + (session.usage.completionTokens ?? 0))} tok
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-2.5 w-2.5" /> Approval-gated execution
                    </span>
                  )
                }
              />
              {toolsSupported ? null : selectedModel ? (
                <p className="px-1 text-[0.6rem] text-amber-600">This model does not support tool calling.</p>
              ) : null}
              {modelsError ? (
                <p className="px-1 text-[0.6rem] text-rose-600">{modelsError}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-sm gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-slate-200 px-4 py-3">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <History className="h-4 w-4 text-indigo-600" /> Conversation history
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
              <Settings2 className="h-4 w-4 text-violet-600" /> System instruction
            </DialogTitle>
            <DialogDescription>
              Shapes how Sarkari Saathi responds. Leave blank to use the global instruction from Settings.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={systemPrompt}
            onChange={(event) => setSystemPrompt(event.target.value)}
            placeholder={globalSystemPrompt || "You are Sarkari, a privacy-first assistant for Indian government paperwork..."}
            className="min-h-[180px] text-sm leading-relaxed"
            maxLength={20000}
          />
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">
              <Sparkles className="h-2.5 w-2.5" /> Global default
            </p>
            <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-600">
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
      <div className="surface flex h-full items-center justify-center rounded-xl">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <p className="text-xs uppercase tracking-[0.15em]">Initializing assistant</p>
        </div>
      </div>
    </div>
  );
}