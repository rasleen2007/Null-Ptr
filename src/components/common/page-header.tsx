"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0">
        {eyebrow ? <p className="eyebrow mb-2">{eyebrow}</p> : null}
        <div className="flex items-center gap-3">
          {Icon ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/[0.07] text-cyan-300">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <h1 className="truncate text-2xl font-semibold tracking-tight text-slate-50 sm:text-[1.75rem]">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </motion.div>
  );
}
