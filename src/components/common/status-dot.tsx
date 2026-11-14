import { cn } from "@/lib/utils";

export function StatusDot({
  tone = "online",
  className,
  pulse = true,
}: {
  tone?: "online" | "warning" | "offline" | "busy";
  className?: string;
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    online: "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.45)]",
    warning: "bg-amber-400 shadow-[0_0_10px_2px_rgba(251,191,36,0.45)]",
    offline: "bg-slate-500",
    busy: "bg-cyan-300 shadow-[0_0_10px_2px_rgba(34,211,238,0.55)]",
  };
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5 shrink-0 rounded-full", tones[tone], className)}>
      {pulse && tone !== "offline" ? (
        <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60", tones[tone])} />
      ) : null}
    </span>
  );
}
