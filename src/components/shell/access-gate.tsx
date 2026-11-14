"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearStoredAccessToken, getStoredAccessToken, storeAccessToken } from "@/lib/access-client";

type GateState = "checking" | "locked" | "unlocked" | "error";

async function verifyToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function AccessGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>("checking");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (!response.ok) throw new Error(`Harness health check failed (${response.status}).`);
        const data = (await response.json()) as { authRequired?: boolean };
        if (cancelled) return;
        if (!data.authRequired) {
          setState("unlocked");
          return;
        }
        const stored = getStoredAccessToken();
        if (stored && (await verifyToken(stored))) {
          if (!cancelled) setState("unlocked");
          return;
        }
        clearStoredAccessToken();
        if (!cancelled) setState("locked");
      } catch (cause) {
        if (!cancelled) {
          setError((cause as Error).message);
          setState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    const candidate = token.trim();
    if (!candidate) {
      setError("Enter the access token configured on the server.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const valid = await verifyToken(candidate);
    setSubmitting(false);
    if (!valid) {
      setError("That token was rejected. Check JARVIS_ACCESS_TOKEN on the server.");
      return;
    }
    storeAccessToken(candidate);
    setState("unlocked");
  }, [token]);

  if (state === "unlocked") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-cyan-400/15 bg-slate-950/70 p-8 shadow-[0_0_80px_-30px_rgba(34,211,238,0.5)] backdrop-blur-2xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/25 bg-cyan-400/10">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-slate-100">JARVIS</p>
            <p className="text-xs text-slate-500">Secure access link</p>
          </div>
        </div>

        {state === "checking" ? (
          <div className="flex items-center gap-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            Initializing secure link...
          </div>
        ) : state === "error" ? (
          <div className="space-y-4">
            <p className="text-sm text-rose-300">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry connection
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-400">
              This harness is protected by an access token. Enter the value configured in{" "}
              <code className="rounded bg-white/5 px-1 py-0.5 text-cyan-200">JARVIS_ACCESS_TOKEN</code>.
            </p>
            <div className="space-y-2">
              <label htmlFor="jarvis-access-token" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Access token
              </label>
              <Input
                id="jarvis-access-token"
                type="password"
                autoComplete="current-password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="Bearer token"
              />
            </div>
            {error ? <p className="text-xs text-rose-300">{error}</p> : null}
            <Button className="w-full" onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Unlock JARVIS
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
