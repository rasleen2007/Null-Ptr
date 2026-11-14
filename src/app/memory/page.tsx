"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  BrainCircuit,
  Database,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";
import type { MemoryRecord } from "@/harness/types";
import { apiGet, apiSend, type MemoriesResponse } from "@/lib/api";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type MemoryWithScore = MemoryRecord & { score?: number };

function importanceLabel(value: number): { label: string; tone: string } {
  if (value >= 0.75) return { label: "High", tone: "text-rose-300" };
  if (value >= 0.4) return { label: "Medium", tone: "text-amber-300" };
  return { label: "Low", tone: "text-slate-400" };
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryWithScore[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<MemoryRecord | null>(null);
  const [draft, setDraft] = useState({ content: "", tags: "", importance: 0.6 });
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<MemoryRecord | null>(null);

  const load = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "500" });
      if (search.trim()) params.set("q", search.trim());
      const data = await apiGet<MemoriesResponse>(`/api/memory?${params.toString()}`);
      setMemories(data.memories);
      setError(null);
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 280 : 0);
    return () => clearTimeout(timer);
  }, [load, query]);

  const stats = useMemo(() => {
    const total = memories.length;
    const accessTotal = memories.reduce((sum, memory) => sum + memory.accessCount, 0);
    const avgImportance = total
      ? memories.reduce((sum, memory) => sum + memory.importance, 0) / total
      : 0;
    const tagCounts = new Map<string, number>();
    for (const memory of memories) {
      for (const tag of memory.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { total, accessTotal, avgImportance, topTags };
  }, [memories]);

  function openCreate() {
    setEditing(null);
    setDraft({ content: "", tags: "", importance: 0.6 });
    setDialogOpen(true);
  }

  function openEdit(memory: MemoryRecord) {
    setEditing(memory);
    setDraft({
      content: memory.content,
      tags: memory.tags.join(", "),
      importance: memory.importance,
    });
    setDialogOpen(true);
  }

  async function save() {
    const content = draft.content.trim();
    if (content.length < 3) {
      toast.error("Memory must be at least 3 characters.");
      return;
    }
    const tags = draft.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 12);
    setSaving(true);
    try {
      if (editing) {
        await apiSend(`/api/memory/${editing.id}`, "PATCH", {
          content,
          tags,
          importance: draft.importance,
        });
        toast.success("Memory updated");
      } else {
        await apiSend("/api/memory", "POST", {
          content,
          tags,
          importance: draft.importance,
        });
        toast.success("Memory stored");
      }
      setDialogOpen(false);
      await load(query);
    } catch (saveError) {
      toast.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiSend(`/api/memory/${target.id}`, "DELETE");
      setMemories((prev) => prev.filter((memory) => memory.id !== target.id));
      toast.success("Memory deleted");
    } catch (deleteError) {
      toast.error((deleteError as Error).message);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Long-term memory"
        title="Memory explorer"
        description="Facts, preferences, and context Jarvis can recall across conversations. Retrieval is lexical with importance and recency weighting."
        icon={BrainCircuit}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load(query)} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              New memory
            </Button>
          </>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Stored memories" value={formatNumber(stats.total)} hint="Searchable records" icon={Database} delay={0} />
        <StatCard
          label="Avg importance"
          value={stats.total ? `${Math.round(stats.avgImportance * 100)}%` : "—"}
          hint="Weighting for retrieval"
          icon={TrendingUp}
          accent="violet"
          delay={0.05}
        />
        <StatCard
          label="Memory recalls"
          value={formatNumber(stats.accessTotal)}
          hint="Injected into context"
          icon={Sparkles}
          accent="emerald"
          delay={0.1}
        />
        <StatCard
          label="Distinct tags"
          value={formatNumber(stats.topTags.length)}
          hint="Top tags below"
          icon={Tag}
          accent="amber"
          delay={0.15}
        />
      </div>

      <div className="mt-6 glass p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memories — e.g. “preferred response style”, “project deadline”…"
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.topTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setQuery(tag)}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[0.62rem] text-slate-400 transition-colors hover:border-cyan-400/30 hover:text-cyan-200"
              >
                {tag} <span className="text-slate-600">{count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4">
        {error ? (
          <EmptyState
            icon={BrainCircuit}
            title="Memory store unavailable"
            description={error}
            action={<Button variant="secondary" onClick={() => void load(query)}>Retry</Button>}
          />
        ) : loading && !memories.length ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <div key={index} className="h-44 animate-pulse rounded-2xl bg-white/[0.03]" />
            ))}
          </div>
        ) : !memories.length ? (
          <EmptyState
            icon={BrainCircuit}
            title={query ? "No matching memories" : "Memory is empty"}
            description={
              query
                ? "Try a different phrase, or store a new memory to capture this context."
                : "Ask Jarvis to remember something in chat, or create a memory manually. Memories are recalled lexically when relevant."
            }
            action={<Button onClick={openCreate}><Plus className="h-3.5 w-3.5" /> Add first memory</Button>}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {memories.map((memory, index) => {
              const importance = importanceLabel(memory.importance);
              return (
                <motion.div
                  key={memory.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.3) }}
                >
                  <Card className="group flex h-full flex-col p-4 transition-colors hover:border-cyan-400/20">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={cn("text-[0.55rem] uppercase tracking-[0.16em]", importance.tone)}>
                          {importance.label} importance
                        </span>
                        {typeof memory.score === "number" ? (
                          <Badge variant="secondary" className="px-1.5 py-0 font-mono text-[0.52rem]">
                            score {memory.score.toFixed(2)}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(memory)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-slate-500 hover:text-rose-300"
                          onClick={() => setPendingDelete(memory)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <p className="mt-2.5 flex-1 whitespace-pre-wrap text-[0.78rem] leading-relaxed text-slate-300">
                      {memory.content}
                    </p>

                    {memory.tags.length ? (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {memory.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md border border-cyan-400/15 bg-cyan-400/[0.04] px-1.5 py-0.5 text-[0.55rem] text-cyan-200/70"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="mt-3">
                      <div className="flex items-center justify-between text-[0.55rem] text-slate-600">
                        <span>Weight</span>
                        <span>{Math.round(memory.importance * 100)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                          style={{ width: `${Math.round(memory.importance * 100)}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5 text-[0.55rem] text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <RefreshCw className="h-2.5 w-2.5" /> {memory.accessCount} recalls
                      </span>
                      <span>{relativeTime(memory.updatedAt)}</span>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit memory" : "Store a memory"}</DialogTitle>
            <DialogDescription>
              Memories are retrieved by lexical overlap, importance, and recency. Keep entries factual and self-contained.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="memory-content">Content</Label>
              <Textarea
                id="memory-content"
                value={draft.content}
                onChange={(event) => setDraft((prev) => ({ ...prev, content: event.target.value }))}
                placeholder="e.g. The user prefers concise answers with bullet points and no filler."
                maxLength={5000}
                className="min-h-[120px] text-sm"
              />
              <p className="text-right text-[0.6rem] text-slate-600">{draft.content.length}/5000</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="memory-tags">Tags (comma separated)</Label>
              <Input
                id="memory-tags"
                value={draft.tags}
                onChange={(event) => setDraft((prev) => ({ ...prev, tags: event.target.value }))}
                placeholder="preferences, writing, work"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="memory-importance">Importance</Label>
                <span className="font-mono text-xs text-cyan-300">{Math.round(draft.importance * 100)}%</span>
              </div>
              <input
                id="memory-importance"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={draft.importance}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, importance: Number(event.target.value) }))
                }
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Store memory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete memory?</DialogTitle>
            <DialogDescription>
              This memory will no longer be recalled in future conversations. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
