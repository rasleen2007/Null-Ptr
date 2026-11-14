import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.015] px-6 py-12 text-center",
        className,
      )}
    >
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.05] text-cyan-300/80">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="text-sm font-medium text-slate-200">{title}</h3>
      <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
