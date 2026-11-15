"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function ThinkingIndicator({
  label = "Sarkari Saathi is thinking",
  detail,
  className,
}: {
  label?: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3", className)}>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="h-1.5 w-1.5 rounded-full bg-indigo-500"
            animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.15, 0.8] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.18, ease: "easeInOut" }}
          />
        ))}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-indigo-900">{label}</p>
        {detail ? <p className="mt-0.5 truncate text-[0.7rem] text-slate-500">{detail}</p> : null}
      </div>
      <div className="ml-auto h-px w-16 overflow-hidden rounded-full bg-indigo-100">
        <div className="h-full w-1/2 animate-shimmer bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent bg-[length:200%_100%]" />
      </div>
    </div>
  );
}
