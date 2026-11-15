"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  accent = "indigo",
  delay = 0,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  accent?: "indigo" | "cyan" | "blue" | "violet" | "emerald" | "amber";
  delay?: number;
}) {
  const accents: Record<string, string> = {
    indigo: "border-indigo-200 bg-indigo-50 text-indigo-600",
    cyan: "border-indigo-200 bg-indigo-50 text-indigo-600",
    blue: "border-blue-200 bg-blue-50 text-blue-600",
    violet: "border-violet-200 bg-violet-50 text-violet-600",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-600",
    amber: "border-amber-200 bg-amber-50 text-amber-600",
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
          <p className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg border", accents[accent])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="pointer-events-none absolute -bottom-10 -right-8 h-24 w-24 rounded-full bg-indigo-400/[0.08] blur-2xl" />
    </motion.div>
  );
}
