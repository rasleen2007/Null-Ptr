"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Gauge,
  KeyRound,
  Layers,
  MessageSquare,
  RefreshCw,
  Search,
  Server,
  Sparkles,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { ModelInfo, ProviderStatus } from "@/harness/types";
import { apiSend, loadModels, type ModelsResponse } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { StatusDot } from "@/components/common/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const ENV_HINTS: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  ollama: "OLLAMA_BASE_URL",
};

const PROVIDER_ACCENTS: Record<string, string> = {
  gemini: "from-blue-500/15 to-cyan-400/5 border-blue-400/20",
  groq: "from-orange-500/15 to-amber-400/5 border-orange-400/20",
  openrouter: "from-violet-500/15 to-fuchsia-400/5 border-violet-400/20",
  ollama: "from-emerald-500/15 to-teal-400/5 border-emerald-400/20",
};

function contextLabel(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M ctx`;
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}k ctx`;
  return `${tokens} ctx`;
}

export default function ModelsPage() {
  const [data, setData] = useState<ModelsResponse | null>(null);
  const [defaultModel, setDefaultModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [toolsOnly, setToolsOnly] = useState(false);
  const [savingDefault, setSavingDefault] = useState<string | null>(null);

  const load = useCallback(async (force = false) => {
    if (force) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await loadModels(force);
      setData(response);
      setDefaultModel(response.defaultModel);
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const models = useMemo(() => data?.models ?? [], [data]);
  const providers = useMemo(() => data?.providers ?? [], [data]);

  const providerConfigured = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const provider of providers) {
      map.set(
        provider.id,
        provider.id === "ollama" ? provider.reachable !== false : provider.configured,
      );
    }
    return map;
  }, [providers]);

  const availableModels = useMemo(
    () =>
      models.filter((model) =>
        model.provider === "ollama" ? providerConfigured.get("ollama") : providerConfigured.get(model.provider),
      ),
    [models, providerConfigured],
  );

  const stats = useMemo(() => {
    const configured = providers.filter((provider) =>
      provider.id === "ollama" ? provider.reachable : provider.configured,
    ).length;
    const toolCapable = availableModels.filter((model) => model.supportsTools).length;
    const maxContext = availableModels.reduce((max, model) => Math.max(max, model.contextWindow), 0);
    const free = availableModels.filter((model) => model.free).length;
    return { configured, toolCapable, maxContext, free };
  }, [availableModels, providers]);

  const filteredModels = useMemo(() => {
    const search = query.trim().toLowerCase();
    return models.filter((model) => {
      if (providerFilter !== "all" && model.provider !== providerFilter) return false;
      if (toolsOnly && !model.supportsTools) return false;
      if (!search) return true;
      return (
        model.label.toLowerCase().includes(search) ||
        model.model.toLowerCase().includes(search) ||
        model.description.toLowerCase().includes(search) ||
        model.tags.some((tag) => tag.toLowerCase().includes(search))
      );
    });
  }, [models, providerFilter, query, toolsOnly]);

  async function setAsDefault(model: ModelInfo) {
    setSavingDefault(model.id);
    try {
      await apiSend("/api/settings", "PATCH", { defaultModel: model.id });
      setDefaultModel(model.id);
      toast.success(`Default model set to ${model.label}`);
    } catch (saveError) {
      toast.error((saveError as Error).message);
    } finally {
      setSavingDefault(null);
    }
  }

  function isAvailable(model: ModelInfo) {
    return model.provider === "ollama"
      ? providerConfigured.get("ollama")
      : providerConfigured.get(model.provider);
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Intelligence layer"
        title="Model manager"
        description="Inspect provider readiness, browse the model catalogue, and choose the default model. Credentials stay server-side in environment variables."
        icon={Cpu}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
            {refreshing ? "Probing…" : "Re-probe providers"}
          </Button>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Providers online"
          value={`${stats.configured}/${providers.length || 4}`}
          hint="Cloud keys + local Ollama"
          icon={Server}
          delay={0}
        />
        <StatCard
          label="Ready models"
          value={formatNumber(availableModels.length)}
          hint={`${formatNumber(models.length)} in catalogue`}
          icon={Layers}
          accent="blue"
          delay={0.05}
        />
        <StatCard
          label="Tool-capable"
          value={formatNumber(stats.toolCapable)}
          hint="Can invoke harness tools"
          icon={Wrench}
          accent="violet"
          delay={0.1}
        />
        <StatCard
          label="Largest context"
          value={stats.maxContext ? contextLabel(stats.maxContext).replace(" ctx", "") : "—"}
          hint={`${stats.free} free-tier models ready`}
          icon={Gauge}
          accent="emerald"
          delay={0.15}
        />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        {providers.map((provider, index) => {
          const online =
            provider.id === "ollama" ? provider.reachable !== false : provider.configured;
          return (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: index * 0.05 }}
            >
              <Card
                className={cn(
                  "relative h-full overflow-hidden bg-gradient-to-br p-4",
                  PROVIDER_ACCENTS[provider.id] ?? "border-white/10 from-white/[0.04] to-transparent",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <StatusDot tone={online ? "online" : "offline"} pulse={online} />
                    <p className="text-sm font-medium text-slate-100">{provider.label}</p>
                  </div>
                  {provider.local ? (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[0.52rem]">local</Badge>
                  ) : online ? (
                    <Badge variant="success" className="px-1.5 py-0 text-[0.52rem]">ready</Badge>
                  ) : (
                    <Badge variant="warning" className="px-1.5 py-0 text-[0.52rem]">needs key</Badge>
                  )}
                </div>
                <p className="mt-2 min-h-[32px] text-[0.66rem] leading-relaxed text-slate-400">
                  {online
                    ? provider.detail ?? "Provider is configured and ready to route requests."
                    : provider.reason ?? provider.detail ?? "Provider is not configured."}
                </p>
                <div className="mt-3 flex items-center justify-between border-t border-white/[0.06] pt-2.5">
                  <code className="rounded-md bg-slate-950/60 px-1.5 py-0.5 font-mono text-[0.55rem] text-slate-500">
                    {ENV_HINTS[provider.id] ?? "env"}
                  </code>
                  <a
                    href={provider.docsUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[0.6rem] text-slate-500 hover:text-cyan-200"
                  >
                    docs <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      <div className="mt-6 glass flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search model catalogue…"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setProviderFilter("all")}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition-colors",
              providerFilter === "all"
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/[0.07] text-slate-500 hover:text-slate-300",
            )}
          >
            All providers
          </button>
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => setProviderFilter(provider.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition-colors",
                providerFilter === provider.id
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                  : "border-white/[0.07] text-slate-500 hover:text-slate-300",
              )}
            >
              {provider.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setToolsOnly((value) => !value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition-colors",
              toolsOnly
                ? "border-violet-400/30 bg-violet-400/10 text-violet-200"
                : "border-white/[0.07] text-slate-500 hover:text-slate-300",
            )}
          >
            <Wrench className="h-3 w-3" /> tools only
          </button>
        </div>
      </div>

      {error ? (
        <Card className="mt-4 border-rose-400/20 bg-rose-400/[0.04] p-6 text-center">
          <p className="text-sm text-rose-200">Model registry unavailable</p>
          <p className="mt-1 text-xs text-rose-200/60">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load(true)}>Retry</Button>
        </Card>
      ) : loading && !data ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-48 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredModels.map((model, index) => {
            const available = isAvailable(model);
            const isDefault = defaultModel === model.id;
            return (
              <motion.div
                key={model.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index * 0.02, 0.2) }}
              >
                <Card
                  className={cn(
                    "flex h-full flex-col p-4 transition-all",
                    isDefault ? "border-cyan-400/30 bg-cyan-400/[0.04]" : "hover:border-white/[0.14]",
                    !available && "opacity-60",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-slate-100">{model.label}</p>
                        {isDefault ? (
                          <Badge className="px-1.5 py-0 text-[0.5rem]">
                            <CheckCircle2 className="h-2.5 w-2.5" /> default
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 font-mono text-[0.58rem] text-slate-600">{model.id}</p>
                    </div>
                    {model.free ? (
                      <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[0.5rem]">free</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0 px-1.5 py-0 text-[0.5rem]">paid</Badge>
                    )}
                  </div>

                  <p className="mt-2 flex-1 text-[0.68rem] leading-relaxed text-slate-400">{model.description}</p>

                  <div className="mt-3 flex flex-wrap gap-1">
                    {model.tags.slice(0, 4).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-md border border-white/[0.07] bg-white/[0.02] px-1.5 py-0.5 text-[0.52rem] text-slate-500"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex items-center gap-3 text-[0.56rem] text-slate-600">
                    <span className="inline-flex items-center gap-1">
                      <Gauge className="h-2.5 w-2.5" /> {contextLabel(model.contextWindow)}
                    </span>
                    <span className={cn("inline-flex items-center gap-1", model.supportsTools && "text-cyan-300/80")}>
                      <Wrench className="h-2.5 w-2.5" /> {model.supportsTools ? "tools" : "no tools"}
                    </span>
                    {!available ? (
                      <span className="ml-auto inline-flex items-center gap-1 text-amber-300/70">
                        <KeyRound className="h-2.5 w-2.5" /> unconfigured
                      </span>
                    ) : (
                      <span className="ml-auto inline-flex items-center gap-1 text-emerald-300/70">
                        <StatusDot tone="online" pulse={false} /> ready
                      </span>
                    )}
                  </div>

                  <div className="mt-3 flex gap-1.5 border-t border-white/[0.05] pt-3">
                    {available ? (
                      <Button asChild variant="secondary" size="sm" className="h-8 flex-1">
                        <Link href={`/chat?model=${encodeURIComponent(model.id)}`}>
                          <MessageSquare className="h-3 w-3" /> Chat
                        </Link>
                      </Button>
                    ) : (
                      <Button variant="secondary" size="sm" className="h-8 flex-1" disabled>
                        <MessageSquare className="h-3 w-3" /> Unavailable
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={isDefault ? "outline" : "default"}
                      className="h-8 flex-1"
                      disabled={!available || isDefault || savingDefault === model.id}
                      onClick={() => void setAsDefault(model)}
                    >
                      {savingDefault === model.id ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3" />
                      )}
                      {isDefault ? "Default" : "Set default"}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {!loading && data && !filteredModels.length ? (
        <Card className="mt-4 p-8 text-center">
          <p className="text-sm text-slate-300">No models match those filters.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setQuery("");
              setProviderFilter("all");
              setToolsOnly(false);
            }}
          >
            Reset filters
          </Button>
        </Card>
      ) : null}

      <Card className="mt-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-300">
              <KeyRound className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-slate-200">Credentials are server-side only</p>
              <p className="mt-1 max-w-2xl text-[0.66rem] leading-relaxed text-slate-500">
                Add keys to <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-[0.6rem]">.env.local</code>{" "}
                and restart the dev server. The browser never receives provider secrets. Ollama models are discovered
                dynamically from the local endpoint.
              </p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href="/settings">
              Open settings <ArrowUpRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
}

