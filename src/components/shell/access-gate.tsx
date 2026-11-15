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
      setError("That token was rejected. Check SAATHI_ACCESS_TOKEN (or JARVIS_ACCESS_TOKEN) on the server.");
      return;
    }
    storeAccessToken(candidate);
    setState("unlocked");
  }, [token]);

  if (state === "unlocked") return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </span>
          <div>
            <p className="text-sm font-semibold tracking-[0.22em] text-slate-900">SARKARI SAATHI</p>
            <p className="text-xs text-slate-500">Secure access link</p>
          </div>
        </div>

        {state === "checking" ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin text-indigo-600" />
            Initializing secure link...
          </div>
        ) : state === "error" ? (
          <div className="space-y-4">
            <p className="text-sm text-rose-600">{error}</p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Retry connection
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-slate-600">
              This harness is protected by an access token. Enter the value configured in{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-indigo-700">SAATHI_ACCESS_TOKEN</code>.
            </p>
            <div className="space-y-2">
              <label htmlFor="saathi-access-token" className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Access token
              </label>
              <Input
                id="saathi-access-token"
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
            {error ? <p className="text-xs text-rose-600">{error}</p> : null}
            <Button className="w-full" onClick={() => void submit()} disabled={submitting}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Unlock Saathi
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
