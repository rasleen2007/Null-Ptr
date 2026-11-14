"use client";

import { cn } from "@/lib/utils";
import type { RetrievedMemory } from "@/harness/types";
import { Badge } from "@/components/ui/badge";

interface MemoryRecallPillsProps {
  memories: RetrievedMemory[];
}

export function MemoryRecallPills({ memories }: MemoryRecallPillsProps) {
  if (!memories.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2">
      <span className="text-[0.55rem] uppercase tracking-[0.16em] text-slate-500">Recalled:</span>
      {memories.map(({ memory, matchedTerms }) => (
        <Badge
          key={memory.id}
          variant="secondary"
          className={cn(
            "gap-1 px-2 py-0.5 text-[0.55rem] cursor-help",
            matchedTerms.length > 0 && "border-emerald-400/30 bg-emerald-400/[0.05]",
          )}
          title={matchedTerms.length ? `Matched: ${matchedTerms.join(", ")}` : "Semantic match"}
        >
          <span className="font-mono">{memory.id}</span>
          {matchedTerms.length > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              <span className="font-mono text-emerald-300/80">{matchedTerms.join(", ")}</span>
            </>
          )}
        </Badge>
      ))}
    </div>
  );
}