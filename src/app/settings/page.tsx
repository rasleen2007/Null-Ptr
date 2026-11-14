"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowUpRight,
  BrainCircuit,
  Check,
  Cpu,
  Gauge,
  HardDrive,
  Loader2,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { AppSettings, ModelInfo } from "@/harness/types";
import { describeModelId } from "@/harness/providers/catalog";
import {
  apiGet,
  apiSend,
  invalidateModelsCache,
  type HealthResponse,
  type ModelsResponse,
  type SettingsResponse,
} from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Draft = Pick<
  AppSettings,
  | "defaultModel"
  | "systemPrompt"
  | "temperature"
  | "maxIterations"
  | "memoryEnabled"
  | "memoryLimit"
  | "toolsEnabled"
  | "streamResponses"
>;

function toDraft(settings: AppSettings): Draft {
  return {
    defaultModel: settings.defaultModel,
    systemPrompt: settings.systemPrompt,
    temperature: settings.temperature,
    maxIterations: settings.maxIterations,
    memoryEnabled: settings.memoryEnabled,
    memoryLimit: settings.memoryLimit,
    toolsEnabled: settings.toolsEnabled,
    streamResponses: settings.streamResponses,
  };
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  delay = 0,
}: {
  icon: typeof Settings;
  title: string;
  description: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-medium text-slate-900">{title}</h2>
            <p className="mt-0.5 text-[0.68rem] leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">{children}</div>
      </Card>
    </motion.div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
      <div>
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className="mt-0.5 text-[0.64rem] leading-relaxed text-slate-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [modelsData, setModelsData] = useState<ModelsResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customModelId, setCustomModelId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsData, models, healthData] = await Promise.all([
        apiGet<SettingsResponse>("/api/settings"),
        apiGet<ModelsResponse>("/api/models"),
        apiGet<HealthResponse>("/api/health"),
      ]);
      setSettings(settingsData.settings);
      setDraft(toDraft(settingsData.settings));
      setSaved(toDraft(settingsData.settings));
      setModelsData(models);
      setHealth(healthData);
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => {
    if (!draft || !saved) return false;
    return JSON.stringify(draft) !== JSON.stringify(saved);
  }, [draft, saved]);

  const models = useMemo(() => modelsData?.models ?? [], [modelsData]);
  const providers = useMemo(() => modelsData?.providers ?? [], [modelsData]);
  const grouped = useMemo(() => {
    const map = new Map<string, ModelInfo[]>();
    for (const model of models) {
      const list = map.get(model.provider) ?? [];
      list.push(model);
      map.set(model.provider, list);
    }
    return map;
  }, [models]);

  const availableProviders = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const provider of providers) {
      map.set(
        provider.id,
        provider.id === "ollama" ? provider.reachable !== false : provider.configured,
      );
    }
    return map;
  }, [providers]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function applyCustomModel() {
    const value = customModelId.trim();
    if (!value.includes(":")) {
      toast.error('Use the "provider:model" format, for example gemini:gemini-3.8-flash.');
      return;
    }
    update("defaultModel", value);
    setCustomModelId("");
  }

  async function save() {
    if (!draft) return;
    if (draft.systemPrompt.length > 20000) {
      toast.error("System instruction exceeds 20,000 characters.");
      return;
    }
    setSaving(true);
    try {
      const response = await apiSend<SettingsResponse>("/api/settings", "PATCH", draft);
      setSettings(response.settings);
      setDraft(toDraft(response.settings));
      setSaved(toDraft(response.settings));
      invalidateModelsCache();
      toast.success("Settings saved");
    } catch (saveError) {
      toast.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
          <p className="text-xs uppercase tracking-[0.2em]">Loading configuration</p>
        </div>
      </PageContainer>
    );
  }

  if (error || !draft || !saved) {
    return (
      <PageContainer>
        <Card className="mx-auto mt-16 max-w-lg border-rose-200 bg-rose-50 p-8 text-center">
          <p className="text-sm text-rose-700">Configuration unavailable</p>
          <p className="mt-1 text-xs text-rose-600">{error ?? "Settings could not be loaded."}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        </Card>
      </PageContainer>
    );
  }

  const providerLabel = new Map(providers.map((provider) => [provider.id, provider.label]));
  const currentModel = models.find((model) => model.id === draft.defaultModel) ?? describeModelId(draft.defaultModel);
  const currentAvailable = currentModel
    ? currentModel.provider === "ollama"
      ? availableProviders.get("ollama")
      : availableProviders.get(currentModel.provider)
    : false;
  const customDefaultModel =
    draft.defaultModel && !models.some((model) => model.id === draft.defaultModel)
      ? draft.defaultModel
      : null;

  return (
    <PageContainer>
      <PageHeader
        eyebrow="System configuration"
        title="Settings"
        description="Configure defaults for model routing, reasoning behavior, memory, and tooling. Credentials and shell allowlists remain environment-managed."
        icon={Settings}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDraft(saved)}
              disabled={!dirty || saving}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </>
        }
      />

      {dirty ? (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />
          <p className="text-[0.66rem] text-indigo-700">You have unsaved configuration changes.</p>
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-4">
          <SectionCard
            icon={Cpu}
            title="Model defaults"
            description="The default route for new conversations, plus sampling and loop limits."
            delay={0}
          >
            <div className="space-y-1.5">
              <Label>Default model</Label>
              <Select value={draft.defaultModel} onValueChange={(value) => update("defaultModel", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select default model" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {customDefaultModel ? (
                    <SelectGroup>
                      <SelectLabel>Custom</SelectLabel>
                      <SelectItem value={customDefaultModel} className="text-xs">
                        {customDefaultModel}
                      </SelectItem>
                    </SelectGroup>
                  ) : null}
                  {[...grouped.entries()].map(([providerId, providerModels]) => (
                    <SelectGroup key={providerId}>
                      <SelectLabel>{providerLabel.get(providerId as typeof providers[number]["id"]) ?? providerId}</SelectLabel>
                      {providerModels.map((model) => {
                        const available =
                          model.provider === "ollama"
                            ? availableProviders.get("ollama")
                            : availableProviders.get(model.provider);
                        return (
                          <SelectItem
                            key={model.id}
                            value={model.id}
                            disabled={!available && model.id !== saved.defaultModel}
                            className="text-xs"
                          >
                            <span className="flex items-center gap-2">
                              {model.label}
                              {!available ? <span className="text-[0.55rem] text-amber-600">unconfigured</span> : null}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[0.62rem] text-slate-500">
                {currentModel ? (
                  <>
                    {currentModel.label} · {formatNumber(currentModel.contextWindow)} tokens ·{" "}
                    {currentModel.supportsTools ? "tool calling" : "no tool calling"}
                    {currentAvailable ? "" : " · provider not configured"}
                  </>
                ) : (
                  "No model selected."
                )}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="custom-model">Custom model ID</Label>
              <div className="flex gap-2">
                <Input
                  id="custom-model"
                  placeholder="gemini:gemini-3.6-flash"
                  value={customModelId}
                  onChange={(event) => setCustomModelId(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      applyCustomModel();
                    }
                  }}
                  className="h-9 font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={applyCustomModel}
                  disabled={!customModelId.trim()}
                >
                  Use
                </Button>
              </div>
              <p className="text-[0.6rem] text-slate-500">
                Use <code className="font-mono">provider:model</code>. Gemini accepts any valid
                model ID; unavailable or non-free models return a provider error.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="temperature">Temperature</Label>
                <span className="font-mono text-xs text-indigo-600">{draft.temperature.toFixed(2)}</span>
              </div>
              <input
                id="temperature"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={draft.temperature}
                onChange={(event) => update("temperature", Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
              />
              <p className="text-[0.6rem] text-slate-500">Lower is deterministic; higher is more exploratory.</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="maxIterations">Max agent iterations</Label>
                <span className="font-mono text-xs text-indigo-600">{draft.maxIterations}</span>
              </div>
              <input
                id="maxIterations"
                type="range"
                min={1}
                max={12}
                step={1}
                value={draft.maxIterations}
                onChange={(event) => update("maxIterations", Number(event.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-indigo-600"
              />
              <p className="text-[0.6rem] text-slate-500">Caps tool-call loops per run to bound cost and latency.</p>
            </div>

            <SwitchRow
              label="Stream responses"
              description="Incrementally stream provider output to the client."
              checked={draft.streamResponses}
              onCheckedChange={(value) => update("streamResponses", value)}
            />
          </SectionCard>

          <SectionCard
            icon={Sparkles}
            title="System instruction"
            description="The base persona and operating rules prepended to every conversation. Conversations can override this."
            delay={0.05}
          >
            <Textarea
              value={draft.systemPrompt}
              onChange={(event) => update("systemPrompt", event.target.value)}
              placeholder="You are Sarkari, a privacy-first assistant for Indian government paperwork..."
              maxLength={20000}
              className="min-h-[240px] text-xs leading-relaxed"
            />
            <div className="flex items-center justify-between text-[0.6rem] text-slate-500">
              <span>Stored server-side with your harness settings.</span>
              <span className={draft.systemPrompt.length > 18000 ? "text-amber-600" : ""}>
                {formatNumber(draft.systemPrompt.length)} / 20,000
              </span>
            </div>
          </SectionCard>
        </div>

        <div className="space-y-4">
          <SectionCard
            icon={BrainCircuit}
            title="Memory & tools"
            description="Control long-term recall and whether tool definitions are exposed to models."
            delay={0.1}
          >
            <SwitchRow
              label="Long-term memory"
              description="Inject relevant stored memories into each request context."
              checked={draft.memoryEnabled}
              onCheckedChange={(value) => update("memoryEnabled", value)}
            />
            <div className="space-y-1.5">
              <Label htmlFor="memoryLimit">Memories per request</Label>
              <Input
                id="memoryLimit"
                type="number"
                min={1}
                max={50}
                value={draft.memoryLimit}
                onChange={(event) =>
                  update("memoryLimit", Math.max(1, Math.min(50, Number(event.target.value) || 1)))
                }
                className="h-9 w-32 font-mono text-xs"
              />
              <p className="text-[0.6rem] text-slate-500">Higher values add context but consume tokens.</p>
            </div>
            <SwitchRow
              label="Tool calling"
              description="Allow tool-capable models to request harness tools."
              checked={draft.toolsEnabled}
              onCheckedChange={(value) => update("toolsEnabled", value)}
            />
          </SectionCard>

          <SectionCard
            icon={ShieldCheck}
            title="Safety posture"
            description="Environment-enforced guardrails. These are read-only from the browser."
            delay={0.15}
          >
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[0.52rem] uppercase tracking-[0.14em] text-slate-500">
                  <HardDrive className="h-2.5 w-2.5" /> Storage
                </p>
                <p className="mt-1 text-xs capitalize text-slate-700">{health?.storage ?? "—"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[0.52rem] uppercase tracking-[0.14em] text-slate-500">
                  <Terminal className="h-2.5 w-2.5" /> Shell
                </p>
                <p className={cn("mt-1 text-xs", health?.safety.shellEnabled ? "text-amber-600" : "text-emerald-600")}>
                  {health ? (health.safety.shellEnabled ? "armed" : "disabled") : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[0.52rem] uppercase tracking-[0.14em] text-slate-500">
                  <ShieldCheck className="h-2.5 w-2.5" /> Approvals
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  {health?.safety.sensitiveToolsRequireApproval ? "per-call" : "off"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center gap-1.5 text-[0.52rem] uppercase tracking-[0.14em] text-slate-500">
                  <Gauge className="h-2.5 w-2.5" /> Context budget
                </p>
                <p className="mt-1 text-xs text-slate-700">
                  {health ? formatNumber(health.limits.contextTokenBudget) : "—"}
                </p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Shell allowlist</p>
              <div className="flex flex-wrap gap-1">
                {health?.safety.shellAllowlist.length ? (
                  health.safety.shellAllowlist.map((command) => (
                    <span
                      key={command}
                      className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[0.58rem] text-slate-600"
                    >
                      {command}
                    </span>
                  ))
                ) : (
                  <span className="text-[0.62rem] text-slate-500">No binaries allowlisted</span>
                )}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-[0.56rem] uppercase tracking-[0.16em] text-slate-500">Workspace</p>
              <code className="block break-all rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[0.6rem] text-slate-600">
                {health?.safety.workspaceDir ?? "—"}
              </code>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-[0.58rem] text-slate-500">
              <Badge variant="secondary" className="px-1.5 py-0 text-[0.5rem]">provider timeout {health ? `${Math.round(health.limits.providerTimeoutMs / 1000)}s` : "—"}</Badge>
              <Badge variant="secondary" className="px-1.5 py-0 text-[0.5rem]">tool timeout {health ? `${Math.round(health.limits.toolTimeoutMs / 1000)}s` : "—"}</Badge>
              <Badge variant="secondary" className="px-1.5 py-0 text-[0.5rem]">v{health?.version ?? "0.1.0"}</Badge>
            </div>
          </SectionCard>

          <Card className="p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600">
                <SlidersHorizontal className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs font-medium text-slate-700">Configuration notes</p>
                <p className="mt-1 text-[0.64rem] leading-relaxed text-slate-500">
                  Provider credentials, shell enablement, and the binary allowlist are read from server environment
                  variables at boot. Update <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.58rem]">.env.local</code>{" "}
                  and restart to change them. This is a single-user local harness — add authentication before exposing it publicly.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Link href="/models" className="inline-flex items-center gap-1 text-[0.62rem] text-indigo-600 hover:text-indigo-700">
                    Model manager <ArrowUpRight className="h-2.5 w-2.5" />
                  </Link>
                  <Link href="/monitor" className="inline-flex items-center gap-1 text-[0.62rem] text-indigo-600 hover:text-indigo-700">
                    Execution monitor <ArrowUpRight className="h-2.5 w-2.5" />
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-start justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center">
        <p className="text-[0.62rem] text-slate-500">
          {dirty ? "Unsaved changes are local to this page." : settings ? `Last updated ${new Date(settings.updatedAt).toLocaleString()}` : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDraft(saved)} disabled={!dirty || saving}>
            Discard
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save configuration
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}