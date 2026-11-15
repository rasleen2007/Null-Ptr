"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  FileText,
  FolderOpen,
  MessageSquare,
  Shield,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { apiGet, type HealthResponse } from "@/lib/api";
import { PageContainer } from "@/components/common/page-container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const GRID_PATTERN = 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M30 0L60 30L30 60L0 30Z\' fill=\'%23ffffff\' fill-opacity=\'0.03\'/%3E%3C/svg%3E")';
const SEARCH_ICON = 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\'%3E%3Cpath d=\'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z\'/%3E%3C/svg%3E")';

interface QuickAction {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  color: QuickActionColor;
  badge?: string;
}

type QuickActionColor = "indigo" | "emerald" | "amber" | "violet" | "blue" | "rose";

const QUICK_ACTION_COLORS: Record<QuickActionColor, string> = {
  indigo: "bg-indigo-100 text-indigo-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  violet: "bg-violet-100 text-violet-600",
  blue: "bg-blue-100 text-blue-600",
  rose: "bg-rose-100 text-rose-600",
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    href: "/chat",
    label: "AI Assistant",
    description: "Chat with Sarkari Saathi for help with government services, schemes, RTI, and forms.",
    icon: MessageSquare,
    color: "indigo",
    badge: "Hindi & English",
  },
  {
    href: "/services",
    label: "Government Schemes",
    description: "Check eligibility, benefits, required documents, and apply for central and state schemes.",
    icon: Sparkles,
    color: "emerald",
    badge: "Scheme lookup",
  },
  {
    href: "/chat?prompt=Draft%20an%20RTI%20application%20for%20",
    label: "Draft RTI Application",
    description: "Generate a complete RTI application with the right format, sections, and submission details.",
    icon: FileText,
    color: "amber",
    badge: "Auto-filled",
  },
  {
    href: "/chat?prompt=Help%20me%20fill%20a%20government%20form%20for%20",
    label: "Fill Government Forms",
    description: "Get step-by-step guidance for filling official forms with your details securely.",
    icon: FolderOpen,
    color: "violet",
    badge: "PDF ready",
  },
  {
    href: "/chat?prompt=Find%20official%20information%20about%20",
    label: "Official Information",
    description: "Look up government portals, circulars, notifications, and contact details from .gov.in sources.",
    icon: Shield,
    color: "blue",
    badge: "Verified sources",
  },
  {
    href: "/documents",
    label: "My Documents",
    description: "Access your generated RTI drafts, filled forms, and saved documents in one place.",
    icon: TrendingUp,
    color: "rose",
    badge: "Download ready",
  },
];

const SUGGESTED_PROMPTS = [
  "Mere liye suitable government schemes batao",
  "Mujhe RTI application draft karni hai",
  "Mujhe ek government form fill karna hai",
  "Mujhe kisi government service ki information chahiye",
  "What schemes am I eligible for in Maharashtra?",
  "Draft an RTI for pending passport application",
];

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [quickPrompt, setQuickPrompt] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: HealthResponse | null) => {
        if (!cancelled) {
          setHealth(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initialPrompt = searchParams.get("prompt");

  function launch(prompt?: string) {
    const value = (prompt ?? quickPrompt).trim();
    router.push(value ? `/chat?prompt=${encodeURIComponent(value)}` : "/chat");
  }

  return (
    <PageContainer className="space-y-8">
      <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-800 p-6 sm:p-8 lg:p-10 text-white">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: GRID_PATTERN }} />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.15em]">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Privacy-first • Local vault • AES-256-GCM
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.15em]">
              Hindi • Hinglish • English
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-[1.1] tracking-tight">
            Government services, <span className="text-amber-300">made simpler and safer.</span>
          </h1>
          <p className="mt-4 text-lg text-indigo-100/90 max-w-2xl">
            Sarkari Saathi helps you file RTIs, apply for schemes, fill forms, and find official information — all while keeping your personal data encrypted and private.
          </p>

          <form
            className="mt-6 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              launch();
            }}
          >
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-indigo-200" style={{ backgroundImage: SEARCH_ICON }} />
              <input
                value={quickPrompt}
                onChange={(event) => setQuickPrompt(event.target.value)}
                placeholder={initialPrompt || "Ask about schemes, RTI, forms, or any government service…"}
                className="w-full h-12 pl-12 pr-4 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-indigo-200/60 focus:border-white/40 focus:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20 text-sm"
                aria-label="Quick prompt"
              />
            </div>
            <Button type="submit" size="lg" className="h-12 shrink-0 bg-white text-indigo-700 hover:bg-indigo-50 font-medium">
              Start <ArrowRight className="h-4 w-4" />
            </Button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {SUGGESTED_PROMPTS.slice(0, 4).map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => launch(suggestion)}
                className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[0.7rem] text-indigo-100 transition-colors hover:border-white/40 hover:bg-white/20"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">What can Sarkari Saathi do?</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Quick actions for common tasks</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {QUICK_ACTIONS.map((action, index) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link href={action.href} className="block">
                <Card className="surface h-full p-5 surface-hover group">
                  <div className="flex items-start gap-4">
                    <span className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      QUICK_ACTION_COLORS[action.color],
                    )}>
                      <action.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-slate-900 group-hover:text-indigo-700">{action.label}</h3>
                        {action.badge && (
                          <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[0.55rem] font-medium text-slate-500">
                            {action.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{action.description}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {health && (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">System status</p>
              <h2 className="mt-1 text-2xl font-semibold text-slate-900">Privacy & connectivity</h2>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card className="surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Shield className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-slate-900">Vault encryption</p>
                  <p className="text-sm text-slate-600">AES-256-GCM with scrypt-derived keys</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Status</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
              </div>
            </Card>

            <Card className="surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                  <Sparkles className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-slate-900">AI provider</p>
                  <p className="text-sm text-slate-600">Ollama local (privacy-first default)</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Model</span>
                  <span className="font-mono text-indigo-600">{health.providers.ollama?.endpoint ?? "localhost:11434"}</span>
                </div>
              </div>
            </Card>

            <Card className="surface p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                  <TrendingUp className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-medium text-slate-900">PII protection</p>
                  <p className="text-sm text-slate-600">Automatic redaction with placeholders</p>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Mode</span>
                  <span className="inline-flex items-center gap-1 font-medium text-indigo-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    Local-only for unknown PII
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </section>
      )}

      <section className="space-y-6 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="eyebrow">How it works</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Three simple steps</h2>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            { step: "01", title: "Ask naturally", description: "Type or speak in Hindi, Hinglish, or English. No special format needed." },
            { step: "02", title: "Get guided help", description: "Sarkari Saathi asks clarifying questions, checks official sources, and prepares your documents." },
            { step: "03", title: "Review & submit", description: "Approve every action. Download RTI drafts, filled forms, or submission instructions." },
          ].map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + index * 0.08, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="surface p-5 relative">
                <span className="absolute -top-3 right-4 font-mono text-3xl font-bold text-slate-200">{item.step}</span>
                <h3 className="mt-2 font-semibold text-slate-900">{item.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <p className="text-center font-mono text-[0.6rem] uppercase tracking-[0.2em] text-slate-500">
        Sarkari Saathi · privacy-first · local vault · free-tier ready · approval-gated execution
      </p>
    </PageContainer>
  );
}