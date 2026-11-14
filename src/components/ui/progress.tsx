import * as React from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  className,
  indicatorClassName,
}: {
  value: number;
  className?: string;
  indicatorClassName?: string;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]", className)}>
      <div
        className={cn(
          "h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-500",
          indicatorClassName,
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-gradient-to-r from-white/[0.03] via-white/[0.08] to-white/[0.03] bg-[length:200%_100%]",
        className,
      )}
    />
  );
}
