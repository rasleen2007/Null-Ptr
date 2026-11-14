import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function relativeTime(iso: string | undefined): string {
  if (!iso) return "—";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  const diff = Date.now() - time;
  const seconds = Math.round(diff / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(time));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

export function truncateText(text: string, max = 160): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function cnStatus(status: string): string {
  switch (status) {
    case "completed":
      return "text-emerald-300 border-emerald-400/30 bg-emerald-400/10";
    case "running":
      return "text-cyan-300 border-cyan-400/30 bg-cyan-400/10";
    case "awaiting_approval":
      return "text-amber-300 border-amber-400/30 bg-amber-400/10";
    case "failed":
      return "text-rose-300 border-rose-400/30 bg-rose-400/10";
    case "cancelled":
      return "text-slate-300 border-slate-400/30 bg-slate-400/10";
    default:
      return "text-slate-300 border-white/10 bg-white/5";
  }
}
