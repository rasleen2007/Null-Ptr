"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Brain,
  Calculator,
  ChevronDown,
  FolderOpen,
  Globe,
  Lock,
  LockOpen,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import type { ToolInfo, ToolPermissionSettings } from "@/harness/types";
import { apiGet, apiSend, type SettingsResponse, type ToolsResponse } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const CATEGORY_META: Record<
  string,
  { label: string; icon: typeof Wrench; className: string }
> = {
  utility: { label: "Utility", icon: Calculator, className: "text-cyan-300 border-cyan-400/20 bg-cyan-400/[0.06]" },
  memory: { label: "Memory", icon: Brain, className: "text-violet-300 border-violet-400/20 bg-violet-400/[0.06]" },
  filesystem: { label: "Filesystem", icon: FolderOpen, className: "text-amber-300 border-amber-400/20 bg-amber-400/[0.06]" },
  system: { label: "System", icon: Terminal, className: "text-rose-300 border-rose-400/20 bg-rose-400/[0.06]" },
  web: { label: "Web", icon: Globe, className: "text-emerald-300 border-emerald-400/20 bg-emerald-400/[0.06]" },
};

const PERMISSION_ROWS: {
  key: keyof ToolPermissionSettings;
  label: string;
  description: string;
  sensitive?: boolean;
}[] = [
  {
    key: "allowFileRead",
    label: "Read workspace files",
    description: "List and read files inside the sandboxed workspace directory.",
  },
  {
    key: "allowFileWrite",
    label: "Write workspace files",
    description: "Create or overwrite files. Each write pauses for explicit approval.",
    sensitive: true,
  },
  {
    key: "allowShell",
    label: "Shell commands",
    description: "Run allowlisted binaries without a shell. Disabled by default.",
    sensitive: true,
  },
  {
    key: "allowMemoryWrite",
    label: "Write memories",
    description: "Allow the agent to store and delete long-term memories.",
  },
  {
    key: "allowNetwork",
    label: "Outbound network",
    description: "Fetch public URLs and search the web through configured endpoints.",
    sensitive: true,
  },
];

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [permissions, setPermissions] = useState<ToolPermissionSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [savingPermission, setSavingPermission] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [toolData, settingsData] = await Promise.all([
        apiGet<ToolsResponse>("/api/tools"),
        apiGet<SettingsResponse>("/api/settings"),
      ]);
      setTools(toolData.tools);
      setPermissions(settingsData.settings.permissions);
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

  const stats = useMemo(() => {
    const enabled = tools.filter((tool) => tool.enabled).length;
    const sensitive = tools.filter((tool) => tool.sensitivity === "sensitive").length;
    const categories = new Set(tools.map((tool) => tool.category)).size;
    return { enabled, sensitive, categories };
  }, [tools]);

  const categories = useMemo(
    () => [...new Set(tools.map((tool) => tool.category))],
    [tools],
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return tools.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      if (!search) return true;
      return (
        tool.name.toLowerCase().includes(search) ||
        tool.description.toLowerCase().includes(search) ||
        tool.category.toLowerCase().includes(search)
      );
    });
  }, [category, query, tools]);

  async function togglePermission(key: keyof ToolPermissionSettings, value: boolean) {
    if (!permissions) return;
    const previous = permissions;
    const next = { ...permissions, [key]: value };
    setPermissions(next);
    setSavingPermission(key);
    try {
      const response = await apiSend<SettingsResponse>("/api/settings", "PATCH", {
        permissions: { [key]: value },
      });
      setPermissions(response.settings.permissions);
      const toolData = await apiGet<ToolsResponse>("/api/tools");
      setTools(toolData.tools);
      toast.success("Permission updated");
    } catch (saveError) {
      setPermissions(previous);
      toast.error((saveError as Error).message);
    } finally {
      setSavingPermission(null);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Capability surface"
        title="Tool manager"
        description="Every capability Jarvis can invoke, plus the permission gates around it. Sensitive calls always pause for per-call approval."
        icon={Wrench}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Registered tools" value={formatNumber(tools.length)} hint="Declared to the agent" icon={Wrench} delay={0} />
        <StatCard label="Currently enabled" value={formatNumber(stats.enabled)} hint="Passing permission gates" icon={LockOpen} accent="emerald" delay={0.05} />
        <StatCard label="Sensitive tools" value={formatNumber(stats.sensitive)} hint="Require per-call approval" icon={ShieldAlert} accent="amber" delay={0.1} />
        <StatCard label="Categories" value={formatNumber(stats.categories)} hint="Utility, memory, fs, system, web" icon={ShieldCheck} accent="violet" delay={0.15} />
      </div>

      <Card className="mt-6 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-100">Permission gates</p>
            <p className="mt-0.5 text-[0.68rem] text-slate-500">
              Changes apply immediately to new tool calls. Approval is still required for sensitive tools.
            </p>
          </div>
          <Badge variant="secondary" className="hidden gap-1 sm:inline-flex">
            <Lock className="h-2.5 w-2.5" /> least privilege
          </Badge>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-2">
          {PERMISSION_ROWS.map((row) => {
            const checked = Boolean(permissions?.[row.key]);
            return (
              <div
                key={row.key}
                className={cn(
                  "flex items-start justify-between gap-4 rounded-xl border px-3.5 py-3 transition-colors",
                  checked
                    ? row.sensitive
                      ? "border-amber-400/20 bg-amber-400/[0.03]"
                      : "border-cyan-400/15 bg-cyan-400/[0.03]"
                    : "border-white/[0.06] bg-white/[0.015]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="text-xs font-medium text-slate-200">{row.label}</p>
                    {row.sensitive ? (
                      <Badge variant="warning" className="px-1.5 py-0 text-[0.48rem]">gated</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-[0.64rem] leading-relaxed text-slate-500">{row.description}</p>
                </div>
                <Switch
                  checked={checked}
                  onCheckedChange={(value) => void togglePermission(row.key, value)}
                  disabled={!permissions || savingPermission === row.key}
                  aria-label={row.label}
                />
              </div>
            );
          })}
        </div>
      </Card>

      <div className="mt-6 glass flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tools…"
            className="h-9 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategory("all")}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-[0.62rem] transition-colors",
              category === "all"
                ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                : "border-white/[0.07] text-slate-500 hover:text-slate-300",
            )}
          >
            All
          </button>
          {categories.map((item) => {
            const meta = CATEGORY_META[item];
            return (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.62rem] capitalize transition-colors",
                  category === item
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                    : "border-white/[0.07] text-slate-500 hover:text-slate-300",
                )}
              >
                {meta ? <meta.icon className="h-3 w-3" /> : null}
                {meta?.label ?? item}
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <Card className="mt-4 border-rose-400/20 bg-rose-400/[0.04] p-6 text-center">
          <p className="text-sm text-rose-200">Tool registry unavailable</p>
          <p className="mt-1 text-xs text-rose-200/60">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : loading && !tools.length ? (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="h-56 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((tool, index) => {
            const meta = CATEGORY_META[tool.category] ?? CATEGORY_META.utility;
            const Icon = meta.icon;
            const required = tool.parameters.required ?? [];
            const propertyNames = Object.keys(tool.parameters.properties ?? {});
            return (
              <motion.div
                key={tool.name}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: Math.min(index * 0.02, 0.2) }}
              >
                <Card
                  className={cn(
                    "flex h-full flex-col p-4 transition-colors",
                    tool.enabled ? "hover:border-cyan-400/20" : "opacity-65",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", meta.className)}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="font-mono text-[0.72rem] text-slate-100">{tool.name}</p>
                        <p className="text-[0.52rem] uppercase tracking-[0.14em] text-slate-600">{meta.label}</p>
                      </div>
                    </div>
                    {tool.sensitivity === "sensitive" ? (
                      <Badge variant="warning" className="shrink-0 gap-1 px-1.5 py-0 text-[0.5rem]">
                        <ShieldAlert className="h-2.5 w-2.5" /> approval
                      </Badge>
                    ) : (
                      <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[0.5rem]">safe</Badge>
                    )}
                  </div>

                  <p className="mt-2.5 flex-1 text-[0.7rem] leading-relaxed text-slate-400">{tool.description}</p>

                  <div className="mt-3 flex items-center justify-between text-[0.56rem]">
                    <span className={cn("inline-flex items-center gap-1", tool.enabled ? "text-emerald-300/80" : "text-slate-600")}>
                      {tool.enabled ? <LockOpen className="h-2.5 w-2.5" /> : <Lock className="h-2.5 w-2.5" />}
                      {tool.enabled ? "enabled" : "disabled"}
                    </span>
                    <span className="text-slate-600">
                      {propertyNames.length} param{propertyNames.length === 1 ? "" : "s"} · {required.length} required
                    </span>
                  </div>

                  {!tool.enabled && tool.disabledReason ? (
                    <p className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.04] px-2 py-1.5 text-[0.6rem] text-amber-200/70">
                      {tool.disabledReason}
                    </p>
                  ) : null}

                  <details className="group mt-2.5 border-t border-white/[0.05] pt-2">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-[0.58rem] text-slate-600 hover:text-slate-400 [&::-webkit-details-marker]:hidden">
                      Parameters
                      <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-white/[0.06] bg-slate-950/70 p-2 font-mono text-[0.6rem] leading-relaxed text-slate-500">
                      {JSON.stringify(tool.parameters, null, 2)}
                    </pre>
                  </details>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {!loading && tools.length && !filtered.length ? (
        <Card className="mt-4 p-8 text-center">
          <p className="text-sm text-slate-300">No tools match those filters.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setQuery("");
              setCategory("all");
            }}
          >
            Reset filters
          </Button>
        </Card>
      ) : null}

      <Card className="mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-amber-400/20 bg-amber-400/[0.06] text-amber-300">
            <ShieldAlert className="h-4 w-4" />
          </span>
          <div>
            <p className="text-xs font-medium text-slate-200">Defense in depth</p>
            <p className="mt-1 max-w-2xl text-[0.66rem] leading-relaxed text-slate-500">
              Shell execution is disabled unless enabled via environment configuration, uses an allowlist of binaries,
              rejects shell operators, and blocks inline code execution. Sensitive tools pause the run and wait for a
              single-use approval.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href="/settings">Safety settings</Link>
        </Button>
      </Card>
    </PageContainer>
  );
}
