"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ChevronRight,
  CircleSlash,
  Clock,
  Eraser,
  ExternalLink,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Terminal,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { ExecutionLog, LogLevel, RunRecord, RunStatus } from "@/harness/types";
import { apiGet, apiSend, streamChatRequest, type LogsResponse, type RunsResponse } from "@/lib/api";
import { cn, cnStatus, formatDate, relativeTime } from "@/lib/utils";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

const LEVELS: LogLevel[] = ["debug", "info", "warn", "error"];

const LEVEL_STYLES: Record<LogLevel, string> = {
  debug: "border-slate-400/20 bg-slate-400/10 text-slate-300",
  info: "border-cyan-400/20 bg-cyan-400/10 text-cyan-200",
  warn: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  error: "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

function RunStatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />;
    case "awaiting_approval":
      return <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />;
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />;
    case "cancelled":
      return <Ban className="h-3.5 w-3.5 text-slate-400" />;
    default:
      return <XCircle className="h-3.5 w-3.5 text-rose-300" />;
  }
}

export default function MonitorPage() {
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [tab, setTab] = useState<"runs" | "logs">("runs");
  const [levelFilter, setLevelFilter] = useState<"all" | LogLevel>("all");
  const [logSearch, setLogSearch] = useState("");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<"approve" | "deny" | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [runData, logData] = await Promise.all([
        apiGet<RunsResponse>("/api/runs"),
        apiGet<LogsResponse>("/api/logs?limit=300"),
      ]);
      setRuns(runData.runs);
      setLogs(logData.logs);
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

  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(true), 5000);
    return () => clearInterval(timer);
  }, [live, load]);

  const stats = useMemo(() => {
    const active = runs.filter((run) => run.status === "running" || run.status === "awaiting_approval").length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const completed = runs.filter((run) => run.status === "completed").length;
    const errors = logs.filter((log) => log.level === "error").length;
    return { active, failed, completed, errors };
  }, [logs, runs]);

  const filteredLogs = useMemo(() => {
    const search = logSearch.trim().toLowerCase();
    return logs.filter((log) => {
      if (levelFilter !== "all" && log.level !== levelFilter) return false;
      if (!search) return true;
      return (
        log.message.toLowerCase().includes(search) ||
        log.event.toLowerCase().includes(search) ||
        (log.runId ?? "").toLowerCase().includes(search)
      );
    });
  }, [levelFilter, logSearch, logs]);

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;

  async function cancelRun(run: RunRecord) {
    try {
      await apiSend(`/api/runs/${run.id}/cancel`, "POST");
      toast.success("Run cancellation requested");
      await load(true);
    } catch (cancelError) {
      toast.error((cancelError as Error).message);
    }
  }

  async function decideRun(approved: boolean) {
    if (!selectedRun) return;
    setDeciding(approved ? "approve" : "deny");
    try {
      const controller = new AbortController();
      await streamChatRequest(
        `/api/runs/${selectedRun.id}/resume`,
        { approved, toolCallId: selectedRun.state.awaitingCall?.id },
        controller.signal,
        () => undefined,
      );
      toast.success(approved ? "Tool call approved" : "Tool call denied");
      await load(true);
    } catch (resumeError) {
      toast.error((resumeError as Error).message);
    } finally {
      setDeciding(null);
    }
  }

  async function clearLogs() {
    setClearOpen(false);
    try {
      await apiSend("/api/logs", "DELETE");
      setLogs([]);
      toast.success("Execution logs cleared");
    } catch (clearError) {
      toast.error((clearError as Error).message);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Observability"
        title="Execution monitor"
        description="Live run state, approval pauses, and structured harness logs. Auto-refreshes every five seconds while live mode is active."
        icon={Activity}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-1.5">
              <span className={cn("h-1.5 w-1.5 rounded-full", live ? "bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.5)]" : "bg-slate-600")} />
              <span className="text-[0.6rem] uppercase tracking-[0.14em] text-slate-500">live</span>
              <Switch checked={live} onCheckedChange={setLive} aria-label="Auto refresh" className="h-5 w-9 [&>span]:h-4 [&>span]:w-4" />
            </div>
            <Button variant="secondary" size="sm" onClick={() => void load(true)} disabled={refreshing}>
              <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active runs" value={stats.active} hint="Streaming or awaiting approval" icon={Activity} delay={0} />
        <StatCard label="Completed" value={stats.completed} hint="Recent run history" icon={CheckCircle2} accent="emerald" delay={0.05} />
        <StatCard label="Failed" value={stats.failed} hint="Requires attention" icon={XCircle} accent="amber" delay={0.1} />
        <StatCard label="Error logs" value={stats.errors} hint={`${logs.length} log entries loaded`} icon={AlertTriangle} accent="violet" delay={0.15} />
      </div>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-white/[0.08] bg-white/[0.02] p-1">
          <button
            type="button"
            onClick={() => setTab("runs")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.14em] transition-colors",
              tab === "runs" ? "bg-cyan-400/12 text-cyan-200" : "text-slate-500 hover:text-slate-300",
            )}
          >
            <Bot className="h-3 w-3" /> Runs <span className="text-slate-600">{runs.length}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("logs")}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.66rem] uppercase tracking-[0.14em] transition-colors",
              tab === "logs" ? "bg-cyan-400/12 text-cyan-200" : "text-slate-500 hover:text-slate-300",
            )}
          >
            <Terminal className="h-3 w-3" /> Logs <span className="text-slate-600">{logs.length}</span>
          </button>
        </div>
        {tab === "logs" ? (
          <Button variant="destructive" size="sm" onClick={() => setClearOpen(true)} disabled={!logs.length}>
            <Eraser className="h-3.5 w-3.5" /> Clear logs
          </Button>
        ) : (
          <p className="text-[0.6rem] text-slate-600">Runs are persisted by the harness store.</p>
        )}
      </div>

      {error ? (
        <Card className="mt-4 border-rose-400/20 bg-rose-400/[0.04] p-6 text-center">
          <p className="text-sm text-rose-200">Monitor unavailable</p>
          <p className="mt-1 text-xs text-rose-200/60">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>Retry</Button>
        </Card>
      ) : loading && !runs.length && !logs.length ? (
        <div className="mt-4 space-y-2">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/[0.03]" />
          ))}
        </div>
      ) : tab === "runs" ? (
        <div className="mt-4 space-y-2">
          {!runs.length ? (
            <EmptyState
              icon={Bot}
              title="No runs recorded"
              description="Start a chat or agent objective to populate the execution history."
              action={<Button asChild><Link href="/chat">Open chat</Link></Button>}
            />
          ) : (
            runs.map((run, index) => (
              <motion.div
                key={run.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
              >
                <Card className="p-3.5 transition-colors hover:border-cyan-400/20">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border",
                          run.kind === "agent"
                            ? "border-violet-400/20 bg-violet-400/[0.06]"
                            : "border-cyan-400/20 bg-cyan-400/[0.06]",
                        )}
                      >
                        {run.kind === "agent" ? (
                          <Bot className="h-3.5 w-3.5 text-violet-300" />
                        ) : (
                          <MessageSquare className="h-3.5 w-3.5 text-cyan-300" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.52rem] uppercase tracking-[0.12em]", cnStatus(run.status))}>
                            <RunStatusIcon status={run.status} />
                            {run.status.replace("_", " ")}
                          </span>
                          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[0.5rem]">
                            {run.id.slice(0, 8)}
                          </Badge>
                          <Badge variant="outline" className="px-1.5 py-0 text-[0.5rem]">{run.kind}</Badge>
                        </div>
                        <p className="mt-1.5 truncate text-[0.76rem] text-slate-300">{run.input}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.56rem] text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {relativeTime(run.createdAt)}
                          </span>
                          <span className="font-mono">{run.state.model}</span>
                          <span>
                            iteration {run.state.iteration}
                          </span>
                          {run.state.pendingCalls.length ? (
                            <span className="text-amber-300/70">{run.state.pendingCalls.length} pending calls</span>
                          ) : null}
                          {run.error ? <span className="truncate text-rose-300/70">{run.error}</span> : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {run.conversationId ? (
                        <Button asChild variant="ghost" size="sm" className="h-8">
                          <Link href={`/chat?conversation=${run.conversationId}`}>
                            <ExternalLink className="h-3 w-3" /> Open
                          </Link>
                        </Button>
                      ) : null}
                      {run.status === "running" || run.status === "awaiting_approval" ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-8"
                          onClick={() => void cancelRun(run)}
                        >
                          <CircleSlash className="h-3 w-3" /> Cancel
                        </Button>
                      ) : null}
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8"
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        Details <ChevronRight className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="glass flex flex-col gap-2 p-2.5 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" />
              <Input
                value={logSearch}
                onChange={(event) => setLogSearch(event.target.value)}
                placeholder="Filter by event, message, or run id…"
                className="h-9 pl-9 text-xs"
              />
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setLevelFilter("all")}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-[0.6rem] uppercase tracking-[0.1em] transition-colors",
                  levelFilter === "all"
                    ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-200"
                    : "border-white/[0.07] text-slate-500 hover:text-slate-300",
                )}
              >
                all
              </button>
              {LEVELS.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setLevelFilter(level)}
                  className={cn(
                    "rounded-lg border px-2.5 py-1.5 text-[0.6rem] uppercase tracking-[0.1em] transition-colors",
                    levelFilter === level
                      ? LEVEL_STYLES[level]
                      : "border-white/[0.07] text-slate-500 hover:text-slate-300",
                  )}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          {!filteredLogs.length ? (
            <EmptyState
              icon={Terminal}
              title="No matching log entries"
              description="Logs capture run lifecycle, provider calls, tool executions, approvals, and failures."
            />
          ) : (
            <Card className="divide-y divide-white/[0.04] p-0">
              {filteredLogs.map((log) => (
                <details key={log.id} className="group px-3.5 py-2.5">
                  <summary className="flex cursor-pointer list-none items-start gap-2.5 [&::-webkit-details-marker]:hidden">
                    <span className={cn("mt-0.5 shrink-0 rounded border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em]", LEVEL_STYLES[log.level])}>
                      {log.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.62rem] text-slate-300">{log.event}</span>
                        <span className="text-[0.55rem] text-slate-600">{formatDate(log.createdAt)}</span>
                        {log.runId ? (
                          <span className="font-mono text-[0.52rem] text-slate-700">run:{log.runId.slice(0, 8)}</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 break-words text-[0.66rem] leading-relaxed text-slate-500">{log.message}</p>
                    </div>
                    <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-slate-700 transition-transform group-open:rotate-90" />
                  </summary>
                  {log.data ? (
                    <pre className="ml-16 mt-2 max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-slate-950/70 p-2.5 font-mono text-[0.6rem] leading-relaxed text-slate-400">
                      {JSON.stringify(log.data, null, 2)}
                    </pre>
                  ) : null}
                </details>
              ))}
            </Card>
          )}
        </div>
      )}

      <Dialog open={Boolean(selectedRun)} onOpenChange={(open) => !open && setSelectedRunId(null)}>
        <DialogContent className="max-w-2xl">
          {selectedRun ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RunStatusIcon status={selectedRun.status} />
                  Run {selectedRun.id.slice(0, 18)}
                </DialogTitle>
                <DialogDescription className="font-mono text-[0.65rem]">
                  {selectedRun.kind} · {selectedRun.state.model} · {formatDate(selectedRun.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1 scrollbar-thin">
                <div>
                  <p className="mb-1 text-[0.56rem] uppercase tracking-[0.16em] text-slate-600">Input</p>
                  <p className="whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-[0.72rem] leading-relaxed text-slate-300">
                    {selectedRun.input}
                  </p>
                </div>
                {selectedRun.error ? (
                  <div className="rounded-lg border border-rose-400/20 bg-rose-400/[0.04] p-2.5 text-[0.68rem] text-rose-200/80">
                    {selectedRun.error}
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-[0.56rem] uppercase tracking-[0.16em] text-slate-600">State snapshot</p>
                  <pre className="max-h-64 overflow-auto rounded-lg border border-white/[0.06] bg-slate-950/70 p-2.5 font-mono text-[0.6rem] leading-relaxed text-slate-400">
                    {JSON.stringify(selectedRun.state, null, 2)}
                  </pre>
                </div>
                {selectedRun.state.awaitingCall ? (
                  <div className="rounded-xl border border-amber-400/25 bg-amber-400/[0.05] p-3">
                    <p className="flex items-center gap-1.5 text-[0.68rem] font-medium text-amber-200">
                      <ShieldAlert className="h-3.5 w-3.5" /> Awaiting approval: {selectedRun.state.awaitingCall.name}
                    </p>
                    <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-slate-950/70 p-2 font-mono text-[0.62rem] text-slate-400">
                      {JSON.stringify(selectedRun.state.awaitingCall.arguments, null, 2)}
                    </pre>
                    <p className="mt-2 text-[0.6rem] text-amber-200/60">
                      Approving here resumes the run and streams its output in the background. Review arguments carefully.
                    </p>
                  </div>
                ) : null}
              </div>
              <DialogFooter className="flex-wrap">
                {selectedRun.status === "awaiting_approval" && selectedRun.state.awaitingCall ? (
                  <>
                    <Button
                      variant="destructive"
                      onClick={() => void decideRun(false)}
                      disabled={deciding !== null}
                    >
                      <XCircle className="h-3.5 w-3.5" /> Deny call
                    </Button>
                    <Button onClick={() => void decideRun(true)} disabled={deciding !== null}>
                      {deciding === "approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Approve call
                    </Button>
                  </>
                ) : selectedRun.status === "running" ? (
                  <Button variant="destructive" onClick={() => void cancelRun(selectedRun)}>
                    <CircleSlash className="h-3.5 w-3.5" /> Cancel run
                  </Button>
                ) : null}
                {selectedRun.conversationId ? (
                  <Button asChild variant="secondary">
                    <Link href={`/chat?conversation=${selectedRun.conversationId}`}>
                      <ExternalLink className="h-3.5 w-3.5" /> Open conversation
                    </Link>
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eraser className="h-4 w-4 text-rose-300" /> Clear execution logs?
            </DialogTitle>
            <DialogDescription>
              All structured logs will be removed from the harness store. Runs and conversations are not affected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setClearOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void clearLogs()}>Clear logs</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
