"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type OrbState = "idle" | "thinking" | "streaming" | "offline";

export function AIOrb({
  size = 220,
  state = "idle",
  className,
  showLabel = false,
}: {
  size?: number;
  state?: OrbState;
  className?: string;
  showLabel?: boolean;
}) {
  const active = state === "thinking" || state === "streaming";
  const ringDuration = active ? 6 : 22;

  return (
    <div className={cn("relative flex flex-col items-center justify-center", className)}>
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <motion.div
          className="absolute -inset-8 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,238,0.22), rgba(37,99,235,0.08) 45%, transparent 70%)",
            filter: "blur(24px)",
          }}
          animate={{ opacity: active ? [0.55, 0.9, 0.55] : [0.35, 0.6, 0.35], scale: active ? [1, 1.07, 1] : [1, 1.03, 1] }}
          transition={{ duration: active ? 2.4 : 6, repeat: Infinity, ease: "easeInOut" }}
        />

        <motion.div
          className="absolute inset-0 rounded-full border border-cyan-400/15"
          animate={{ rotate: 360 }}
          transition={{ duration: ringDuration * 2.2, repeat: Infinity, ease: "linear" }}
        >
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300 shadow-[0_0_12px_3px_rgba(34,211,238,0.6)]" />
          <span className="absolute bottom-0 left-1/2 h-1 w-1 -translate-x-1/2 translate-y-1/2 rounded-full bg-blue-400 shadow-[0_0_8px_2px_rgba(59,130,246,0.5)]" />
        </motion.div>

        <motion.div
          className="absolute inset-[7%] rounded-full border border-dashed border-cyan-300/20"
          animate={{ rotate: -360 }}
          transition={{ duration: ringDuration, repeat: Infinity, ease: "linear" }}
        />

        <div className="absolute inset-[13%] rounded-full border border-white/[0.05]" />

        <motion.div
          className="absolute inset-[18%] overflow-hidden rounded-full"
          animate={{ rotate: 360 }}
          transition={{ duration: ringDuration * 3.5, repeat: Infinity, ease: "linear" }}
        >
          <div className="absolute inset-0 rounded-full border border-cyan-400/30" />
          <div className="absolute left-0 top-1/2 h-px w-full bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent" />
        </motion.div>

        <div className="absolute inset-[20%] rounded-full bg-[radial-gradient(circle_at_35%_28%,#e0fbff_0%,#7dd3fc_12%,#22d3ee_34%,#0369a1_62%,#041c33_88%,#020617_100%)] shadow-[inset_0_0_40px_rgba(125,211,252,0.35),0_0_60px_-10px_rgba(34,211,238,0.55)]">
          <motion.div
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(255,255,255,0.55),transparent_38%)]"
            animate={{ opacity: active ? [0.5, 0.85, 0.5] : [0.35, 0.55, 0.35] }}
            transition={{ duration: active ? 1.8 : 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute inset-0 rounded-full bg-[linear-gradient(rgba(2,6,23,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(2,6,23,0.12)_1px,transparent_1px)] bg-[size:14px_14px] opacity-60" />
          <div className="scanline" style={{ animationDuration: active ? "2.2s" : "5s" }} />
          <div className="absolute inset-0 rounded-full shadow-[inset_0_-20px_50px_rgba(2,6,23,0.75)]" />
        </div>

        <div className="absolute inset-[10%] rounded-full border border-cyan-200/10" />
        <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/90 shadow-[0_0_18px_6px_rgba(224,251,255,0.65)]" />
      </div>

      {showLabel ? (
        <div className="mt-8 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2 text-[0.68rem] uppercase tracking-[0.42em] text-indigo-700/80">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                active ? "bg-indigo-500 shadow-[0_0_10px_2px_rgba(79,70,229,0.6)]" : "bg-emerald-500",
              )}
            />
            {state === "thinking"
              ? "Processing"
              : state === "streaming"
                ? "Transmitting"
                : state === "offline"
                  ? "Offline"
                  : "Core online"}
          </div>
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-slate-400">
            Sovereign privacy layer
          </p>
        </div>
      ) : null}
    </div>
  );
}
