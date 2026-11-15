"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, ShieldAlert, ShieldCheck, X } from "lucide-react";
import type { PermissionRequest } from "@/lib/use-chat-session";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PermissionCard({
  request,
  onDecision,
}: {
  request: PermissionRequest;
  onDecision: (approved: boolean, note?: string) => Promise<void>;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

  async function decide(approved: boolean) {
    setBusy(approved ? "approve" : "deny");
    try {
      await onDecision(approved, note.trim() || undefined);
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.99 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/80 backdrop-blur-xl"
    >
      <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-100/70 px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300 bg-white text-amber-600">
          <ShieldAlert className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900">Permission required</p>
          <p className="text-[0.68rem] text-amber-800/70">
            The agent is paused. Review the request before allowing execution.
          </p>
        </div>
        <Badge variant="warning">Sensitive tool</Badge>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-amber-900">{request.call.name}</span>
          <Badge variant="outline">{request.tool.category}</Badge>
          <Badge variant="danger">requires approval</Badge>
        </div>
        <p className="text-xs leading-relaxed text-slate-600">{request.tool.description}</p>

        <div>
          <p className="mb-1.5 text-[0.58rem] uppercase tracking-[0.18em] text-slate-500">Proposed arguments</p>
          <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-3 font-mono text-[0.7rem] leading-relaxed text-slate-700">
            {JSON.stringify(request.call.arguments, null, 2)}
          </pre>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for the agent…"
            className="h-9 flex-1 text-xs"
            maxLength={400}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="h-9"
              disabled={busy !== null}
              onClick={() => void decide(false)}
            >
              {busy === "deny" ? <X className="h-3.5 w-3.5 animate-pulse" /> : <X className="h-3.5 w-3.5" />}
              Deny
            </Button>
            <Button size="sm" className="h-9" disabled={busy !== null} onClick={() => void decide(true)}>
              <Check className="h-3.5 w-3.5" />
              {busy === "approve" ? "Approving…" : "Approve once"}
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
          <p className="text-[0.62rem] leading-relaxed text-slate-500">
            Approval applies only to this single tool call. Shell commands run without a shell and only with allowlisted binaries.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
