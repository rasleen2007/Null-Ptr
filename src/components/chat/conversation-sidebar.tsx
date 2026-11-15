"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquarePlus, Pin, PinOff, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Conversation } from "@/harness/types";
import { apiGet, apiSend } from "@/lib/api";
import { cn, relativeTime, truncateText } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ConversationList({
  currentId,
  refreshKey,
  onSelect,
  onNew,
  onDeleted,
  className,
}: {
  currentId?: string;
  refreshKey?: number;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDeleted?: (id: string) => void;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null);
  const requestRef = useRef(0);

  const load = useCallback(async (search: string) => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const params = search.trim() ? `?q=${encodeURIComponent(search.trim())}` : "";
      const data = await apiGet<{ conversations: Conversation[] }>(`/api/conversations${params}`);
      if (requestRef.current !== requestId) return;
      setConversations(data.conversations);
      setError(null);
    } catch (loadError) {
      if (requestRef.current !== requestId) return;
      setError((loadError as Error).message);
    } finally {
      if (requestRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, query, refreshKey]);

  const pinned = useMemo(() => conversations.filter((item) => item.pinned), [conversations]);
  const others = useMemo(() => conversations.filter((item) => !item.pinned), [conversations]);

  async function togglePin(conversation: Conversation) {
    try {
      await apiSend(`/api/conversations/${conversation.id}`, "PATCH", { pinned: !conversation.pinned });
      await load(query);
    } catch (pinError) {
      toast.error((pinError as Error).message);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await apiSend(`/api/conversations/${target.id}`, "DELETE");
      setConversations((prev) => prev.filter((item) => item.id !== target.id));
      onDeleted?.(target.id);
      toast.success("Conversation deleted");
    } catch (deleteError) {
      toast.error((deleteError as Error).message);
    }
  }

  function renderItem(conversation: Conversation) {
    const active = conversation.id === currentId;
    return (
      <div key={conversation.id} className="group relative">
        <button
          type="button"
          onClick={() => onSelect(conversation.id)}
          className={cn(
            "w-full rounded-xl border px-3 py-2.5 text-left transition-all",
            active
              ? "border-indigo-200 bg-indigo-50"
              : "border-transparent hover:border-slate-200 hover:bg-slate-50",
          )}
        >
          <div className="flex items-center gap-1.5">
            {conversation.pinned ? <Pin className="h-2.5 w-2.5 shrink-0 text-indigo-500" /> : null}
            <p className={cn("truncate text-[0.72rem] font-medium", active ? "text-indigo-900" : "text-slate-700")}>
              {conversation.title}
            </p>
          </div>
          <p className="mt-0.5 truncate text-[0.62rem] text-slate-500">
            {conversation.lastMessage ? truncateText(conversation.lastMessage, 60) : "No messages yet"}
          </p>
          <div className="mt-1 flex items-center justify-between text-[0.55rem] text-slate-400">
            <span>{relativeTime(conversation.updatedAt)}</span>
            <span>{conversation.messageCount} msg</span>
          </div>
        </button>
        <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={() => void togglePin(conversation)}
            className="rounded-md bg-white/90 p-1 text-slate-500 shadow-sm hover:text-indigo-600"
            aria-label={conversation.pinned ? "Unpin conversation" : "Pin conversation"}
          >
            {conversation.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={() => setPendingDelete(conversation)}
            className="rounded-md bg-white/90 p-1 text-slate-500 shadow-sm hover:text-rose-600"
            aria-label="Delete conversation"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("glass flex h-full min-h-0 flex-col overflow-hidden", className)}>
      <div className="space-y-2.5 p-3">
        <Button onClick={onNew} className="w-full" size="sm">
          <MessageSquarePlus className="h-3.5 w-3.5" />
          New conversation
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search history…"
            className="h-8 rounded-lg bg-white pl-8 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3 scrollbar-thin">
        {loading && !conversations.length ? (
          <div className="space-y-2 px-1">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : error ? (
          <p className="px-3 py-6 text-center text-[0.68rem] text-rose-600">{error}</p>
        ) : !conversations.length ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[0.7rem] text-slate-500">{query ? "No matches found." : "No conversations yet."}</p>
            <p className="mt-1 text-[0.6rem] text-slate-400">Start a chat to build your history.</p>
          </div>
        ) : (
          <>
            {pinned.length ? (
              <div className="space-y-1">
                <p className="px-2 pt-1 text-[0.52rem] uppercase tracking-[0.2em] text-slate-400">Pinned</p>
                {pinned.map(renderItem)}
              </div>
            ) : null}
            <div className="space-y-1">
              {pinned.length ? (
                <p className="px-2 pt-1 text-[0.52rem] uppercase tracking-[0.2em] text-slate-400">Recent</p>
              ) : null}
              {others.map(renderItem)}
            </div>
          </>
        )}
      </div>

      <Dialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.title}” and its messages will be permanently removed from this harness.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
