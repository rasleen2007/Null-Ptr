"use client";

import { CheckCircle2, ChevronDown, Loader2, ShieldAlert, Wrench, XCircle } from "lucide-react";
import type { ToolActivity } from "@/lib/use-chat-session";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export function ToolActivityList({ activities }: { activities: ToolActivity[] }) {
  if (!activities.length) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {activities.map((activity) => {
        const pending = activity.result === undefined;
        const isError = activity.isError;
        return (
          <details
            key={activity.call.id}
            className={cn(
              "group rounded-xl border bg-white/[0.015] px-3 py-2 text-xs",
              isError
                ? "border-rose-400/20"
                : pending
                  ? "border-cyan-400/20"
                  : "border-emerald-400/15",
            )}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-slate-300 [&::-webkit-details-marker]:hidden">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-300" />
              ) : isError ? (
                <XCircle className="h-3.5 w-3.5 text-rose-300" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
              )}
              <Wrench className="h-3 w-3 text-slate-500" />
              <span className="font-mono text-[0.68rem] text-slate-200">{activity.call.name}</span>
              {activity.sensitivity === "sensitive" ? (
                <Badge variant="warning" className="gap-1 px-1.5 py-0 text-[0.52rem]">
                  <ShieldAlert className="h-2.5 w-2.5" /> gated
                </Badge>
              ) : null}
              <span className="ml-auto text-[0.6rem] text-slate-600">
                {pending ? "running" : isError ? "failed" : "complete"}
              </span>
              {activity.result ? <ChevronDown className="h-3 w-3 text-slate-600 transition-transform group-open:rotate-180" /> : null}
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 text-[0.55rem] uppercase tracking-[0.16em] text-slate-600">Arguments</p>
                <pre className="max-h-40 overflow-auto rounded-lg border border-white/[0.06] bg-slate-950/70 p-2 font-mono text-[0.65rem] text-slate-400">
                  {JSON.stringify(activity.call.arguments, null, 2)}
                </pre>
              </div>
              {activity.result ? (
                <div>
                  <p className="mb-1 text-[0.55rem] uppercase tracking-[0.16em] text-slate-600">Result</p>
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-slate-950/70 p-2 font-mono text-[0.65rem] text-slate-400">
                    {activity.result}
                  </pre>
                </div>
              ) : null}
            </div>
          </details>
        );
      })}
    </div>
  );
}
