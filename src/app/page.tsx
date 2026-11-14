"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  BrainCircuit,
  Cpu,
  MessageSquare,
  Network,
  ShieldCheck,
  Sparkles,
  Wrench,
  Zap,
} from "lucide-react";
import { AIOrb } from "@/components/visual/ai-orb";
import { PageContainer } from "@/components/common/page-container";
import { StatCard } from "@/components/common/stat-card";
import { StatusDot } from "@/components/common/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { cn, cnStatus, formatNumber, relativeTime, truncateText } from "@/lib/utils";
import type { Conversation } from "@/harness/types";
import {
  apiGet,
  type HealthResponse,
  type MemoriesResponse,
  type ModelsResponse,
  type RunsResponse,
  type SettingsResponse,
  type ToolsResponse,
} from "@/lib/api";

const SUGGESTIONS = [
  "What can this harness do?",
  "Remember that I prefer concise answers",
  "Plan a focused work session for today",
];

export default function DashboardPage() {
  const router = useRouter();
  const [quickPrompt, setQuickPrompt] = useState("");
  const [data, setData] = useState<{
    health: HealthResponse | null;
    models: ModelsResponse | null;
    settings: SettingsResponse["settings"] | null;
    conversations: Conversation[];
    memories: MemoriesResponse["memories"];
    runs: RunsResponse["runs"];
    tools: ToolsResponse["tools"];
    loaded: boolean;
  }>({
    health: null,
    models: null,
    settings: null,
    conversations: [],
    memories: [],
    runs: [],
    tools: [],
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [health, models, settings, conversations, memories, runs, tools] = await Promise.allSettled([
        apiGet<HealthResponse>("/api/health"),
        apiGet<ModelsResponse>("/api/models"),
        apiGet<SettingsResponse>("/api/settings"),
        apiGet<{ conversations: Conversation[] }>("/api/conversations"),
        apiGet<MemoriesResponse>("/api/memory?limit=200"),
        apiGet<RunsResponse>("/api/runs"),
        apiGet<ToolsResponse>("/api/tools"),
      ]);
      if (cancelled) return;
      setData({
        health: health.status === "fulfilled" ? health.value : null,
        models: models.status === "fulfilled" ? models.value : null,
        settings: settings.status === "fulfilled" ? settings.value.settings : null,
        conversations:
          conversations.status === "fulfilled" ? conversations.value.conversations ?? [] : [],
        memories: memories.status === "fulfilled" ? memories.value.memories ?? [] : [],
        runs: runs.status === "fulfilled" ? runs.value.runs ?? [] : [],
        tools: tools.status === "fulfilled" ? tools.value.tools ?? [] : [],
        loaded: true,
      });
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledTools = useMemo(() => data.tools.filter((tool) => tool.enabled).length, [data.tools]);
  const configuredCloud = useMemo(() => {
    if (!data.health) return 0;
    return [data.health.providers.gemini, data.health.providers.groq, data.health.providers.openrouter].filter(
      Boolean,
    ).length;
  }, [data.health]);

  const defaultModel = useMemo(() => {
    const id = data.settings?.defaultModel ?? data.models?.defaultModel;
    if (!id) return "—";
    const model = data.models?.models.find((entry) => entry.id === id);
    return model?.label ?? id;
  }, [data.models, data.settings]);

  function launch(prompt?: string) {
    const value = (prompt ?? quickPrompt).trim();
    router.push(value ? `/chat?prompt=${encodeURIComponent(value)}` : "/chat");
  }

  return (
    <PageContainer className="space-y-6">
      <section className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative overflow-hidden rounded-3xl border border-white/[0.07] bg-[rgba(5,12,25,0.55)] p-6 backdrop-blur-xl sm:p-8"
        >
          <div className="pointer-events-none absolute inset-0 grid-overlay opacity-40" />
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/[0.08] blur-3xl" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success" className="gap-2">
                <StatusDot tone="online" />
                Systems online
              </Badge>
              <Badge variant="secondary">{data.health?.storage === "supabase" ? "Supabase persistence" : "Local persistence"}</Badge>
              <Badge variant="secondary">{configuredCloud} cloud provider{configuredCloud === 1 ? "" : "s"}</Badge>
            </div>

            <h1 className="mt-6 max-w-xl text-3xl font-semibold leading-[1.1] tracking-tight text-slate-50 sm:text-[2.75rem]">
              Your intelligence,
              <span className="gradient-text"> orchestrated.</span>
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-relaxed text-slate-400">
              JARVIS routes your intent across hosted and local models, retrieves durable memory, and
              executes tools under explicit permission. One harness. Total context.
            </p>

            <form
              className="mt-6 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault();
                launch();
              }}
            >
              <div className="relative flex-1">
                <Sparkles className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-cyan-300/70" />
                <Input
                  value={quickPrompt}
                  onChange={(event) => setQuickPrompt(event.target.value)}
                  placeholder="Issue a command or ask anything…"
                  className="h-12 pl-10 pr-4 text-sm"
                  aria-label="Quick prompt"
                />
              </div>
              <Button type="submit" size="lg" className="h-12 shrink-0">
                Engage <ArrowRight className="h-4 w-4" />
              </Button>
            </form>

            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => launch(suggestion)}
                  className="rounded-full border border-white/10 bg-white/[0.025] px-3 py-1.5 text-[0.7rem] text-slate-400 transition-colors hover:border-cyan-400/30 hover:text-cyan-200"
                >
                  {suggestion}
                </button>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild variant="secondary">
                <Link href="/chat">
                  <MessageSquare className="h-4 w-4" /> Open chat workspace
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/agent">
                  <Bot className="h-4 w-4" /> Deploy agent
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative flex flex-col items-center justify-center overflow-hidden rounded-3xl border border-cyan-400/10 bg-[rgba(4,10,22,0.6)] p-6 backdrop-blur-xl"
        >
          <div className="pointer-events-none absolute inset-0 grid-overlay opacity-50" />
          <AIOrb size={210} showLabel state={data.loaded ? "idle" : "thinking"} />
          <div className="relative mt-7 grid w-full grid-cols-3 gap-2">
            {[
              { label: "Providers", value: `${configuredCloud}/3`, icon: Network },
              { label: "Tools", value: `${enabledTools}`, icon: Wrench },
              { label: "Memories", value: `${formatNumber(data.memories.length)}`, icon: BrainCircuit },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-center">
                <item.icon className="mx-auto h-3.5 w-3.5 text-cyan-300/70" />
                <p className="mt-1.5 text-sm font-semibold text-slate-100">{item.value}</p>
                <p className="text-[0.56rem] uppercase tracking-[0.18em] text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="relative mt-4 w-full space-y-2">
            <div className="flex items-center justify-between text-[0.62rem] uppercase tracking-[0.15em] text-slate-500">
              <span>Context capacity</span>
              <span className="font-mono text-slate-400">
                {formatNumber(data.health?.limits.contextTokenBudget ?? 12000)} tok
              </span>
            </div>
            <Progress value={62} />
          </div>
        </motion.div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Conversations"
          value={data.loaded ? formatNumber(data.conversations.length) : "—"}
          hint="Persistent, searchable history"
          icon={MessageSquare}
          delay={0.02}
        />
        <StatCard
          label="Long-term memory"
          value={data.loaded ? formatNumber(data.memories.length) : "—"}
          hint="Lexically retrieved each turn"
          icon={BrainCircuit}
          accent="violet"
          delay={0.06}
        />
        <StatCard
          label="Active tools"
          value={data.loaded ? `${enabledTools}/${data.tools.length || 0}` : "—"}
          hint="Sensitive calls need approval"
          icon={Wrench}
          accent="emerald"
          delay={0.1}
        />
        <StatCard
          label="Default model"
          value={<span className="text-base leading-snug">{defaultModel}</span>}
          hint={data.models?.models.find((m) => m.id === (data.settings?.defaultModel ?? ""))?.provider ?? "Routing standby"}
          icon={Cpu}
          accent="blue"
          delay={0.14}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="glass p-5"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Recent transmissions</p>
              <h2 className="mt-1 text-lg font-semibold text-slate-100">Conversations</h2>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/chat">
                Open workspace <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="mt-4 space-y-1">
            {data.conversations.slice(0, 5).map((conversation) => (
              <Link
                key={conversation.id}
                href={`/chat?conversation=${conversation.id}`}
                className="group flex items-start gap-3 rounded-xl border border-transparent px-3 py-3 transition-colors hover:border-white/[0.07] hover:bg-white/[0.025]"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-300/80">
                  <MessageSquare className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-slate-200 group-hover:text-cyan-100">
                      {conversation.title}
                    </p>
                    {conversation.pinned ? <Badge variant="warning">Pinned</Badge> : null}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {conversation.lastMessage ? truncateText(conversation.lastMessage, 120) : "No messages yet"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[0.62rem] text-slate-500">{relativeTime(conversation.updatedAt)}</p>
                  <p className="mt-1 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-slate-600">
                    {conversation.messageCount} msg
                  </p>
                </div>
              </Link>
            ))}
            {!data.conversations.length ? (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                <p className="text-sm text-slate-400">No conversations yet.</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link href="/chat">Start the first one</Link>
                </Button>
              </div>
            ) : null}
          </div>
        </motion.div>

        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.14 }}
            className="glass p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Inference matrix</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-100">Providers</h2>
              </div>
              <Badge variant={configuredCloud ? "default" : "warning"}>
                {configuredCloud ? "Routing ready" : "Configure a provider"}
              </Badge>
            </div>
            <div className="mt-4 space-y-2.5">
              {[
                { name: "Google Gemini", key: "gemini", ok: data.health?.providers.gemini },
                { name: "Groq", key: "groq", ok: data.health?.providers.groq },
                { name: "OpenRouter", key: "openrouter", ok: data.health?.providers.openrouter },
              ].map((provider) => (
                <div key={provider.key} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <StatusDot tone={provider.ok ? "online" : "offline"} pulse={Boolean(provider.ok)} />
                    <span className="text-sm text-slate-300">{provider.name}</span>
                  </div>
                  <span className={cn("text-[0.6rem] uppercase tracking-[0.16em]", provider.ok ? "text-emerald-300/80" : "text-slate-500")}>
                    {provider.ok ? "Linked" : "No key"}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <StatusDot tone="busy" />
                  <span className="text-sm text-slate-300">Ollama local</span>
                </div>
                <span className="max-w-[10rem] truncate font-mono text-[0.56rem] text-slate-500">
                  {data.health?.providers.ollama.endpoint ?? "localhost:11434"}
                </span>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] px-3 py-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-cyan-300/80" />
              <p className="text-[0.68rem] leading-relaxed text-slate-400">
                API keys stay server-side. Sensitive tools always require explicit approval.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18 }}
            className="glass p-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="eyebrow">Execution plane</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-100">Recent runs</h2>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/monitor">
                  Monitor <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <div className="mt-3 space-y-1.5">
              {data.runs.slice(0, 4).map((run) => (
                <div key={run.id} className="flex items-center gap-3 rounded-lg px-2 py-2">
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5 text-[0.55rem] uppercase tracking-wider",
                      cnStatus(run.status),
                    )}
                  >
                    {run.status.replace("_", " ")}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-xs text-slate-400">{truncateText(run.input, 60)}</p>
                  <span className="shrink-0 text-[0.58rem] text-slate-600">{relativeTime(run.createdAt)}</span>
                </div>
              ))}
              {!data.runs.length ? <p className="px-2 py-4 text-xs text-slate-500">No executions recorded yet.</p> : null}
            </div>
          </motion.div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { href: "/memory", title: "Memory grid", copy: "Inspect, add and curate durable knowledge.", icon: BrainCircuit },
          { href: "/models", title: "Model routing", copy: "Switch providers, inspect free tiers, set defaults.", icon: Cpu },
          { href: "/tools", title: "Tool governance", copy: "Grant capabilities and review tool schemas.", icon: Wrench },
          { href: "/monitor", title: "Run telemetry", copy: "Trace iterations, tool calls, and errors.", icon: Zap },
        ].map((module, index) => (
          <motion.div
            key={module.href}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.06 * index }}
          >
            <Link
              href={module.href}
              className="group flex h-full items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 transition-all hover:border-cyan-400/25 hover:bg-cyan-400/[0.03]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-cyan-300/80">
                <module.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-sm font-medium text-slate-200">
                  {module.title}
                  <ArrowUpRight className="h-3 w-3 text-slate-600 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-cyan-300" />
                </p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{module.copy}</p>
              </div>
            </Link>
          </motion.div>
        ))}
      </section>

      <p className="pb-2 text-center font-mono text-[0.58rem] uppercase tracking-[0.24em] text-slate-700">
        JARVIS harness · local-first · free-tier ready · approval-gated execution
      </p>
    </PageContainer>
  );
}

