"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Database, KeyRound, Loader2, Lock, LockKeyhole, Unlock } from "lucide-react";
import { toast } from "sonner";
import {
  loadVault,
  lockVault as lockVaultRequest,
  unlockVault as unlockVaultRequest,
  type VaultStatusResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Compact vault status + unlock control for the chat header.
 *
 * It only ever receives placeholder metadata from the API; real values never
 * leave the server.
 */
export function VaultControl({
  onChanged,
  className,
}: {
  onChanged?: (status: VaultStatusResponse) => void;
  className?: string;
}) {
  const [status, setStatus] = useState<VaultStatusResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = useCallback(
    (next: VaultStatusResponse) => {
      setStatus(next);
      onChanged?.(next);
    },
    [onChanged],
  );

  const refresh = useCallback(async () => {
    try {
      apply(await loadVault());
    } catch {
      // The chat stays usable even if the vault API is unreachable.
    }
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unlocked = Boolean(status?.unlocked);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    try {
      const next = await unlockVaultRequest(passphrase);
      apply(next);
      setPassphrase("");
      setOpen(false);
      toast.success("Vault unlocked for this session");
    } catch (unlockError) {
      setError((unlockError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    try {
      apply(await lockVaultRequest());
      setOpen(false);
      toast.success("Vault locked");
    } catch (lockError) {
      toast.error((lockError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const label = status === null ? "Vault" : unlocked ? "Vault unlocked" : "Vault locked";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 gap-1.5 rounded-lg px-2 text-[0.62rem]",
          unlocked ? "text-emerald-700 hover:text-emerald-800" : "text-slate-500",
          className,
        )}
        onClick={() => {
          setError(null);
          setOpen(true);
          void refresh();
        }}
        title={
          unlocked
            ? "The vault is unlocked for this session"
            : "The vault is locked. Personal data in chat will be refused."
        }
      >
        {unlocked ? <Unlock className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
        <span className="hidden md:inline">{label}</span>
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setPassphrase("");
            setError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {unlocked ? (
                <Unlock className="h-4 w-4 text-emerald-600" />
              ) : (
                <KeyRound className="h-4 w-4 text-indigo-600" />
              )}
              {unlocked ? "Vault unlocked" : status?.exists ? "Unlock vault" : "Create vault"}
            </DialogTitle>
            <DialogDescription>
              {unlocked
                ? "Personal identifiers are decrypted in server memory so approved local tools can fill real values. The model still sees placeholders."
                : status?.exists
                  ? "Enter your passphrase to let approved local tools use real values. A wrong passphrase is rejected without touching stored data."
                  : "Create a passphrase to start protecting personal identifiers. It is never stored; without it the vault cannot be decrypted."}
            </DialogDescription>
          </DialogHeader>

          {unlocked ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="inline-flex items-center gap-2 text-[0.7rem] text-slate-500">
                  <Database className="h-3.5 w-3.5 text-indigo-600" /> Protected fields
                </span>
                <span className="font-mono text-xs text-slate-800">
                  {status?.fieldCount ?? 0}
                </span>
              </div>
              <p className="text-[0.66rem] leading-relaxed text-slate-500">
                Locking clears the key from memory. Chat keeps working, but a new personal
                identifier is refused until you unlock again.
              </p>
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="chat-vault-passphrase">Passphrase</Label>
                <Input
                  id="chat-vault-passphrase"
                  type="password"
                  autoComplete="current-password"
                  value={passphrase}
                  onChange={(event) => {
                    setPassphrase(event.target.value);
                    setError(null);
                  }}
                  placeholder="At least 6 characters"
                  autoFocus
                />
              </div>
              {error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[0.68rem] text-rose-700">
                  {error}
                </p>
              ) : null}
              <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
          )}

          <DialogFooter>
            <Button asChild variant="ghost" className="mr-auto">
              <Link href="/privacy">
                Manage vault <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            {unlocked ? (
              <Button variant="secondary" onClick={() => void handleLock()} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                Lock vault
              </Button>
            ) : (
              <>
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={(event) => {
                    event.preventDefault();
                    void handleUnlock(event);
                  }}
                  disabled={passphrase.length < 6 || busy}
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlock className="h-3.5 w-3.5" />
                  )}
                  {status?.exists ? "Unlock" : "Create"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
