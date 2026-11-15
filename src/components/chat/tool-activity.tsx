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
              "group rounded-xl border bg-white px-3 py-2 text-xs",
              isError
                ? "border-rose-200"
                : pending
                  ? "border-indigo-200"
                  : "border-emerald-200",
            )}
          >
            <summary className="flex cursor-pointer list-none items-center gap-2 text-slate-600 [&::-webkit-details-marker]:hidden">
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
              ) : isError ? (
                <XCircle className="h-3.5 w-3.5 text-rose-600" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              )}
              <Wrench className="h-3 w-3 text-slate-400" />
              <span className="font-mono text-[0.68rem] text-slate-800">{activity.call.name}</span>
              {activity.sensitivity === "sensitive" ? (
                <Badge variant="warning" className="gap-1 px-1.5 py-0 text-[0.52rem]">
                  <ShieldAlert className="h-2.5 w-2.5" /> gated
                </Badge>
              ) : null}
              <span className="ml-auto text-[0.6rem] text-slate-400">
                {pending ? "running" : isError ? "failed" : "complete"}
              </span>
              {activity.result ? <ChevronDown className="h-3 w-3 text-slate-400 transition-transform group-open:rotate-180" /> : null}
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="mb-1 text-[0.55rem] uppercase tracking-[0.16em] text-slate-400">Arguments</p>
                <pre className="max-h-40 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[0.65rem] text-slate-600">
                  {JSON.stringify(activity.call.arguments, null, 2)}
                </pre>
              </div>
              {activity.result ? (
                <div>
                  <p className="mb-1 text-[0.55rem] uppercase tracking-[0.16em] text-slate-400">Result</p>
                  <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 font-mono text-[0.65rem] text-slate-600">
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
