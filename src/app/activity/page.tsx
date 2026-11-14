"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Run {
  id: string;
  conversationId: string;
  model: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  startedAt: string;
  completedAt?: string;
  prompt: string;
  error?: string;
  toolsUsed: string[];
  tokensUsed?: number;
}

interface ToolExecution {
  id: string;
  runId: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed" | "awaiting_approval";
  startedAt: string;
  completedAt?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  requiresApproval: boolean;
}

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "bg-slate-100 text-slate-600", icon: Clock },
  running: { label: "Running", color: "bg-indigo-100 text-indigo-600", icon: Loader2 },
  completed: { label: "Completed", color: "bg-emerald-100 text-emerald-600", icon: CheckCircle2 },
  failed: { label: "Failed", color: "bg-rose-100 text-rose-600", icon: AlertTriangle },
  awaiting_approval: { label: "Awaiting Approval", color: "bg-amber-100 text-amber-600", icon: ShieldCheck },
} as const;

async function fetchRuns(): Promise<Run[]> {
  try {
    const response = await fetch("/api/runs", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.runs || [];
  } catch {
    return [];
  }
}

async function fetchToolExecutions(runId: string): Promise<ToolExecution[]> {
  try {
    const response = await fetch(`/api/runs/${runId}/tools`, { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.executions || [];
  } catch {
    return [];
  }
}

function StatusBadge({ status }: { status: Run["status"] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", config.color)}>
      <Icon className="h-3 w-3" /> {config.label}
    </Badge>
  );
}

function ToolStatusBadge({ status }: { status: ToolExecution["status"] }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[0.55rem] h-4 px-2", config.color)}>
      <Icon className="h-2.5 w-2.5" /> {config.label}
    </Badge>
  );
}

function RunRow({
  run,
  onView,
  onDelete,
}: {
  run: Run;
  onView: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-slate-900 truncate max-w-xs">{run.prompt.slice(0, 80)}</p>
          <p className="text-sm text-slate-500 font-mono">{run.id.slice(0, 12)}</p>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <StatusBadge status={run.status} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">
        {run.toolsUsed.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {run.toolsUsed.slice(0, 3).map((tool) => (
              <Badge key={tool} variant="secondary" className="text-[0.55rem] h-4 px-2">
                {tool}
              </Badge>
            ))}
            {run.toolsUsed.length > 3 && (
              <Badge variant="secondary" className="text-[0.55rem] h-4 px-2">
                +{run.toolsUsed.length - 3}
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-sm text-slate-500">
        {formatRelativeTime(run.startedAt)}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-sm text-slate-500">
        {run.tokensUsed ? `${run.tokensUsed.toLocaleString()} tok` : "—"}
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onClick={() => onView(run.id)} className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" /> View Details
            </DropdownMenuItem>
            {run.conversationId ? (
              <DropdownMenuItem onClick={() => window.location.href = `/chat?conversation=${run.conversationId}`} className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" /> Open Conversation
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(run.id)} className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function ToolExecutionRow({
  execution,
}: {
  execution: ToolExecution;
}) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="rounded bg-slate-100 p-1.5">
            <Activity className="h-4 w-4 text-slate-500" />
          </div>
          <span className="font-mono text-sm text-slate-700">{execution.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <ToolStatusBadge status={execution.status} />
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {formatRelativeTime(execution.startedAt)}
      </td>
      <td className="px-4 py-3">
        {execution.requiresApproval && execution.status === "awaiting_approval" ? (
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 gap-1">
            <ShieldCheck className="h-3 w-3" /> Approval Required
          </Badge>
        ) : execution.error ? (
          <Badge variant="danger" className="gap-1">
            <AlertTriangle className="h-3 w-3" /> Error
          </Badge>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
          window.open(`/api/runs/${execution.runId}/tools/${execution.id}`, "_blank");
        }} title="View execution log">
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}

function RunDetailDialog({
  run,
  onClose,
}: {
  run: Run | null;
  onClose: () => void;
}) {
  const [tools, setTools] = useState<ToolExecution[]>([]);
  const [loadingTools, setLoadingTools] = useState(false);

  useEffect(() => {
    if (!run) return;
    async function load() {
      setLoadingTools(true);
      const executions = await fetchToolExecutions(run!.id);
      setTools(executions);
      setLoadingTools(false);
    }
    load();
  }, [run]);

  if (!run) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate font-mono text-sm">{run.id}</span>
            <StatusBadge status={run.status} />
          </DialogTitle>
          <DialogDescription>
            Model: {run.model} · Started {formatDate(run.startedAt)} · {run.tokensUsed ? `${run.tokensUsed.toLocaleString()} tokens` : "No token data"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <p className="text-sm font-medium text-slate-500 mb-2">Prompt</p>
            <p className="whitespace-pre-wrap text-slate-900">{run.prompt}</p>
          </div>

          {run.error && (
            <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
              <p className="text-sm font-medium text-rose-700 mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Error
              </p>
              <p className="text-sm text-rose-600 font-mono">{run.error}</p>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="font-medium text-slate-900">Tool Executions ({tools.length})</h4>
              {loadingTools && <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />}
            </div>
            {tools.length === 0 && !loadingTools ? (
              <p className="text-sm text-slate-500 py-4 text-center">No tool executions for this run</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-sm font-medium text-slate-500 border-b border-slate-200">
                      <th className="px-4 py-2">Tool</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Time</th>
                      <th className="px-4 py-2">Approval</th>
                      <th className="px-4 py-2 text-right">Log</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tools.map((execution) => (
                      <ToolExecutionRow key={execution.id} execution={execution} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
          {run.conversationId && (
            <Button onClick={() => { window.location.href = `/chat?conversation=${run.conversationId}`; onClose(); }}>
              <ArrowRight className="h-4 w-4 mr-1" /> Open in Chat
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <Activity className="h-16 w-16 text-slate-300 mb-4" />
      <h3 className="text-lg font-medium text-slate-900">No activity yet</h3>
      <p className="mt-2 text-slate-500">Your assistant runs and tool executions will appear here</p>
    </div>
  );
}

export default function ActivityPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<Run["status"] | "all">("all");
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const data = await fetchRuns();
      setRuns(data);
      setLoading(false);
    }
    load();
  }, []);

  const filteredRuns = runs.filter((run) => {
    const matchesSearch = run.prompt.toLowerCase().includes(filter.toLowerCase()) ||
      run.id.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === "all" || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleDelete = (id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
    setDeleteConfirm(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Activity & Approvals</h1>
              <p className="mt-1 text-slate-600">
                {runs.length} run{runs.length === 1 ? "" : "s"} · Track executions, approvals & tool activity
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setRuns([]); }} className="gap-2" disabled={runs.length === 0}>
                <Trash2 className="h-4 w-4" /> Clear All
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search runs by prompt or ID..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as Run["status"] | "all")}
                className="flex h-10 items-center px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="running">Running</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
                <option value="awaiting_approval">Awaiting Approval</option>
              </select>
              <Button variant="outline" onClick={() => { setFilter(""); setStatusFilter("all"); }} className="gap-2">
                <Filter className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals Banner */}
      {runs.some((r) => r.status === "awaiting_approval") && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
            <ShieldCheck className="h-6 w-6 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-amber-800">Pending Approvals</p>
              <p className="text-sm text-amber-700">
                You have {runs.filter((r) => r.status === "awaiting_approval").length} run{runs.filter((r) => r.status === "awaiting_approval").length === 1 ? "" : "s"} awaiting your approval.{" "}
                <Button variant="ghost" size="sm" className="h-7 px-2 py-0" onClick={() => setStatusFilter("awaiting_approval")}>
                  View pending
                </Button>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Runs Table */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {filteredRuns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm font-medium text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3">Prompt</th>
                  <th className="px-4 py-3 hidden md:table-cell">Status</th>
                  <th className="px-4 py-3 hidden md:table-cell">Tools</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Started</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Tokens</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRuns.map((run) => (
                  <RunRow
                    key={run.id}
                    run={run}
                    onView={(id) => {
                      const run = runs.find((r) => r.id === id);
                      if (run) setSelectedRun(run);
                    }}
                    onDelete={(id) => setDeleteConfirm(id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRuns.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {filteredRuns.length} of {runs.length} runs</span>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> Approval-Gated
            </Badge>
          </div>
        )}
      </main>

      {/* Run Detail Dialog */}
      <RunDetailDialog run={selectedRun} onClose={() => setSelectedRun(null)} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Run</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this run and all its tool executions? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}