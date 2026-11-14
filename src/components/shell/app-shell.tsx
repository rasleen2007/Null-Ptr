"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  FolderOpen,
  Home,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Shield,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/utils";
import { StatusDot } from "@/components/common/status-dot";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AccessGate } from "@/components/shell/access-gate";
import type { HealthResponse } from "@/lib/api";

const LARGE_TEXT_ICON = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M4 7V4h16v3\'/%3E%3Cpath d=\'M9 20h6\'/%3E%3Cpath d=\'M12 4v16\'/%3E%3C/svg%3E")';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  short: string;
}

const SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Main",
items: [
        { href: "/", label: "Home", short: "Home", icon: Home },
        { href: "/chat", label: "AI Assistant", short: "Assistant", icon: MessageSquare },
      ],
  },
  {
    label: "Services",
    items: [
      { href: "/services", label: "Government Services", short: "Services", icon: FileText },
      { href: "/documents", label: "My Documents", short: "Documents", icon: FolderOpen },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/activity", label: "Activity & Approvals", short: "Activity", icon: Sparkles },
      { href: "/privacy", label: "Privacy Center", short: "Privacy", icon: Shield },
      { href: "/settings", label: "Settings", short: "Settings", icon: Settings },
    ],
  },
];

const ALL_ITEMS = SECTIONS.flatMap((section) => section.items);

function SarkariMark() {
  return (
    <span className="relative flex h-9 w-9 items-center justify-center">
      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-600/20 to-indigo-800/10" />
      <span className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-indigo-300/30 bg-white">
        <span className="relative flex h-4 w-4 items-center justify-center rounded-full bg-[radial-gradient(circle_at_35%_30%,#fff,#6366f1_45%,#3730a3_90%)] shadow-[0_0_12px_2px_rgba(99,102,241,0.4)]">
          <span className="absolute inset-0 rounded-full border border-white/40" />
        </span>
        <span className="absolute inset-1 rounded-lg border border-indigo-300/20" />
      </span>
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

  const storageLabel = health ? (health.storage === "supabase" ? "Supabase linked" : "Local storage") : "Initializing";

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] flex-col border-r border-slate-200 bg-white/80 backdrop-blur-2xl lg:flex">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6 border-b border-slate-200">
        <SarkariMark />
        <div>
          <p className="text-base font-semibold tracking-[0.1em] text-slate-900">Sarkari Saathi</p>
          <p className="text-[0.6rem] uppercase tracking-[0.15em] text-indigo-600/70">Government Services Assistant</p>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6 scrollbar-thin">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-[0.6rem] font-medium uppercase tracking-[0.2em] text-slate-500">
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
                      active
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                    )}
                  >
                    {active ? (
                      <motion.span
                        layoutId="sidebar-active"
                        className="absolute inset-0 rounded-xl bg-indigo-100/50"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    <item.icon className={cn("relative h-4 w-4", active ? "text-indigo-600" : "text-slate-400")} />
                    <span className="relative">{item.label}</span>
                    {active && (
                      <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.6rem] uppercase tracking-[0.15em] text-slate-500">Storage</span>
            <StatusDot tone={health ? "online" : "offline"} pulse={Boolean(health)} />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">{storageLabel}</p>
          <p className="mt-0.5 font-mono text-[0.55rem] uppercase tracking-[0.15em] text-slate-500">
            v0.1.0
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
  const [largeText, setLargeText] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("saathi-large-text") === "true";
    }
    return false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("large-text", largeText);
    localStorage.setItem("saathi-large-text", String(largeText));
  }, [largeText]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/70 px-4 backdrop-blur-xl sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="lg:hidden">
          <SarkariMark />
        </div>
        <div className="hidden items-center gap-2 text-[0.7rem] uppercase tracking-[0.15em] text-slate-500 sm:flex">
          <span>Sarkari Saathi</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-700">{current?.label ?? "Home"}</span>
        </div>
        <span className="text-xs text-slate-500 sm:hidden">{current?.short ?? "Saathi"}</span>
      </div>
      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setLargeText((prev) => !prev)}
              className={cn(
                "flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[0.62rem] uppercase tracking-[0.15em] transition-colors hover:bg-slate-100",
                largeText ? "text-indigo-600 border-indigo-200 bg-indigo-50" : "text-slate-500",
              )}
              aria-label={largeText ? "Disable large text" : "Enable large text"}
              aria-pressed={largeText}
            >
              <span className="h-3.5 w-3.5" style={{ backgroundImage: LARGE_TEXT_ICON }} />
              <span className="hidden sm:inline">Large text</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-[0.6rem]">
            {largeText ? "Disable large text mode" : "Enable large text mode"}
          </TooltipContent>
        </Tooltip>
        <div className="hidden items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 sm:flex">
          <StatusDot tone="online" />
          <span className="text-[0.62rem] uppercase tracking-[0.15em] text-emerald-700/90">All systems operational</span>
        </div>
      </div>
    </header>
  );
}

function MobileNav({ activePath }: { activePath: string }) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-stretch justify-around border-t border-slate-200 bg-white/95 px-1 backdrop-blur-2xl lg:hidden">
      {ALL_ITEMS.map((item) => {
        const active = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1 transition-colors",
              active ? "text-indigo-600" : "text-slate-500 active:text-slate-700",
            )}
          >
            {active ? (
              <motion.span
                layoutId="mobile-active"
                className="absolute inset-x-2 top-0 h-px bg-indigo-500 shadow-[0_0_8px_2px_rgba(99,102,241,0.4)]"
              />
            ) : null}
            <item.icon className="h-[1.1rem] w-[1.1rem]" />
            <span className="text-[0.5rem] uppercase tracking-[0.1em]">{item.short}</span>
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
        <div className="relative z-10 min-h-screen">
          <Sidebar activePath={pathname} />
          <div className="flex min-h-screen min-w-0 flex-col lg:pl-[260px]">
            <TopBar activePath={pathname} />
            <main className="relative flex-1 pb-16 lg:pb-0">{children}</main>
          </div>
          <MobileNav activePath={pathname} />
        </div>
        <Toaster
          theme="light"
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(255, 255, 255, 0.98)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "#1e293b",
              backdropFilter: "blur(16px)",
              boxShadow: "0 10px 40px -10px rgba(15, 23, 42, 0.15)",
            },
          }}
        />
      </TooltipProvider>
    </AccessGate>
  );
}

export { Tooltip, TooltipContent, TooltipTrigger };