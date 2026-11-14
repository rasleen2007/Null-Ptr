"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "cyan",
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  accent?: "cyan" | "blue" | "violet" | "emerald" | "amber";
  delay?: number;
}) {
  const accents: Record<string, string> = {
    cyan: "border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300",
    blue: "border-blue-400/20 bg-blue-400/[0.07] text-blue-300",
    violet: "border-violet-400/20 bg-violet-400/[0.07] text-violet-300",
    emerald: "border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-300",
    amber: "border-amber-400/20 bg-amber-400/[0.07] text-amber-300",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
      className="glass glass-hover relative overflow-hidden p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="panel-label">{label}</p>
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", accents[accent])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="pointer-events-none absolute -bottom-10 -right-8 h-24 w-24 rounded-full bg-cyan-400/[0.06] blur-2xl" />
    </motion.div>
  );
}
