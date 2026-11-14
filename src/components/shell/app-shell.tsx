"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Bot,
  BrainCircuit,
  Cpu,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/common/status-dot";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccessGate } from "@/components/shell/access-gate";
import type { HealthResponse } from "@/lib/api";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  short: string;
}

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Core",
    items: [
      { href: "/", label: "Dashboard", short: "Home", icon: LayoutDashboard },
      { href: "/chat", label: "Chat workspace", short: "Chat", icon: MessageSquare },
      { href: "/agent", label: "Agent workspace", short: "Agent", icon: Bot },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/memory", label: "Memory explorer", short: "Memory", icon: BrainCircuit },
      { href: "/models", label: "Model manager", short: "Models", icon: Cpu },
      { href: "/tools", label: "Tool manager", short: "Tools", icon: Wrench },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/monitor", label: "Execution monitor", short: "Monitor", icon: Activity },
      { href: "/settings", label: "Settings", short: "Config", icon: Settings },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((section) => section.items);

function JarvisMark() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-400/30 to-blue-600/20 blur-md" />
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/30 bg-slate-950/70">
        <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#e0fbff,#22d3ee_45%,#0369a1_90%)] shadow-[0_0_12px_2px_rgba(34,211,238,0.55)]">
          <span className="absolute inset-0 rounded-full border border-white/30" />
        </span>
        <span className="absolute inset-1 rounded-lg border border-cyan-400/10" />
      </span>
    </span>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const value = now
    ? new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: "UTC",
      }).format(now)
    : "--:--:--";
  return (
    <span className="font-mono text-[0.7rem] tracking-[0.18em] text-slate-400">
      {value} <span className="text-slate-600">UTC</span>
    </span>
  );
}

function Sidebar({ activePath }: { activePath: string }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: HealthResponse | null) => {
        if (!cancelled) setHealth(data);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const storageLabel = health ? (health.storage === "supabase" ? "Supabase link" : "Local store") : "Initializing";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-white/[0.06] bg-[#030914]/80 backdrop-blur-2xl lg:flex">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <JarvisMark />
        <div>
          <p className="text-[0.95rem] font-semibold tracking-[0.24em] text-slate-100">JARVIS</p>
          <p className="text-[0.55rem] uppercase tracking-[0.22em] text-cyan-300/50">Personal AI harness</p>
        </div>
      </div>

      <div className="mx-5 h-px bg-gradient-to-r from-cyan-400/20 via-white/5 to-transparent" />

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6 scrollbar-thin">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-[0.58rem] font-medium uppercase tracking-[0.24em] text-slate-600">
              {section.label}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                      active ? "text-cyan-100" : "text-slate-400 hover:bg-white/[0.035] hover:text-slate-200",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl border border-cyan-400/20 bg-gradient-to-r from-cyan-400/[0.12] to-blue-500/[0.04]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    <item.icon className={cn("relative h-4 w-4", active ? "text-cyan-300" : "text-slate-500")} />
                    <span className="relative">{item.label}</span>
                    {active ? (
                      <span className="relative ml-auto h-1 w-1 rounded-full bg-cyan-300 shadow-[0_0_8px_2px_rgba(34,211,238,0.6)]" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/[0.06] p-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">Storage</span>
            <StatusDot tone={health ? "online" : "offline"} pulse={Boolean(health)} />
          </div>
          <p className="mt-1.5 text-xs text-slate-300">{storageLabel}</p>
          <p className="mt-0.5 font-mono text-[0.58rem] uppercase tracking-[0.18em] text-slate-600">
            harness v0.1.0
          </p>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ activePath }: { activePath: string }) {
  const current = ALL_ITEMS.find((item) =>
    item.href === "/" ? activePath === "/" : activePath.startsWith(item.href),
  );
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-white/[0.05] bg-[#020617]/70 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="lg:hidden">
          <JarvisMark />
        </div>
        <div className="hidden items-center gap-2 text-[0.68rem] uppercase tracking-[0.22em] text-slate-500 sm:flex">
          <span>JARVIS</span>
          <span className="text-slate-700">/</span>
          <span className="text-slate-300">{current?.label ?? "Console"}</span>
        </div>
        <span className="text-xs text-slate-500 sm:hidden">{current?.short ?? "JARVIS"}</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden items-center gap-2 rounded-full border border-emerald-400/15 bg-emerald-400/[0.05] px-3 py-1.5 sm:flex">
          <StatusDot tone="online" />
          <span className="text-[0.62rem] uppercase tracking-[0.2em] text-emerald-300/90">Systems nominal</span>
        </div>
        <Clock />
      </div>
    </header>
  );
}

function MobileNav({ activePath }: { activePath: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-stretch justify-around border-t border-white/[0.07] bg-[#030914]/95 px-1 backdrop-blur-2xl lg:hidden">
      {ALL_ITEMS.map((item) => {
        const active = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors",
              active ? "text-cyan-300" : "text-slate-500 active:text-slate-300",
            )}
          >
            {active ? (
              <motion.span
                layoutId="mobile-active"
                className="absolute inset-x-2 top-0 h-px bg-cyan-300 shadow-[0_0_10px_2px_rgba(34,211,238,0.5)]"
              />
            ) : null}
            <item.icon className="h-[1.05rem] w-[1.05rem]" />
            <span className="text-[0.52rem] uppercase tracking-[0.1em]">{item.short}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  return (
    <AccessGate>
      <TooltipProvider delayDuration={180}>
        <ParticleFieldMount />
        <div className="relative z-10 min-h-screen">
          <Sidebar activePath={pathname} />
          <div className="flex min-h-screen min-w-0 flex-col lg:pl-[252px]">
            <TopBar activePath={pathname} />
            <main className="relative flex-1 pb-16 lg:pb-0">{children}</main>
          </div>
          <MobileNav activePath={pathname} />
        </div>
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(7, 16, 33, 0.95)",
              border: "1px solid rgba(34, 211, 238, 0.18)",
              color: "#e2e8f0",
              backdropFilter: "blur(16px)",
            },
          }}
        />
      </TooltipProvider>
    </AccessGate>
  );
}

function ParticleFieldMount() {
  const [Field, setField] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    void import("@/components/visual/particle-field").then((mod) => setField(() => mod.ParticleField));
  }, []);
  return Field ? <Field /> : null;
}

export { Tooltip, TooltipContent, TooltipTrigger };
