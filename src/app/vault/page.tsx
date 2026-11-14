"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Database,
  Fingerprint,
  KeyRound,
  Loader2,
  Lock,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unlock,
} from "lucide-react";
import { toast } from "sonner";
import {
  forgetVaultField,
  loadVault,
  lockVault,
  unlockVault,
  wipeVault,
  type VaultFieldInfo,
  type VaultStatusResponse,
} from "@/lib/api";
import { cn, formatNumber, relativeTime } from "@/lib/utils";
import { PageContainer } from "@/components/common/page-container";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

const TYPE_LABEL: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  phone: "Phone",
  email: "Email",
  ifsc: "IFSC",
  upi: "UPI",
  account: "Bank account",
  dob: "Date of birth",
  address: "Address",
  name: "Name",
  other: "Other",
};

function typeLabel(type: string): string {
  return TYPE_LABEL[type] ?? type.toUpperCase();
}

export default function VaultPage() {
  const [vault, setVault] = useState<VaultStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [unlockOpen, setUnlockOpen] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const [wipeOpen, setWipeOpen] = useState(false);
  const [pendingForget, setPendingForget] = useState<VaultFieldInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setVault(await loadVault());
    } catch (loadError) {
      setError((loadError as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fields = useMemo(() => vault?.fields ?? [], [vault]);
  const unlocked = Boolean(vault?.unlocked);

  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const field of fields) counts.set(field.type, (counts.get(field.type) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [fields]);

  async function handleUnlock(event: React.FormEvent) {
    event.preventDefault();
    if (!passphrase) return;
    setBusy(true);
    setUnlockError(null);
    try {
      const next = await unlockVault(passphrase);
      setVault(next);
      setPassphrase("");
      setUnlockOpen(false);
      toast.success("Vault unlocked for this session");
    } catch (unlockFailure) {
      setUnlockError((unlockFailure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLock() {
    setBusy(true);
    try {
      setVault(await lockVault());
      toast.success("Vault locked");
    } catch (lockError) {
      toast.error((lockError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleWipe() {
    setBusy(true);
    try {
      setVault(await wipeVault());
      setWipeOpen(false);
      toast.success("Vault and all stored values deleted");
    } catch (wipeError) {
      toast.error((wipeError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleForget() {
    if (!pendingForget) return;
    const target = pendingForget;
    setPendingForget(null);
    setBusy(true);
    try {
      setVault(await forgetVaultField(target.placeholder));
      toast.success(`Forgot ${target.placeholder}`);
    } catch (forgetError) {
      toast.error((forgetError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Personal vault"
        title="Privacy vault"
        description="Names, Aadhaar, PAN, phone numbers, and addresses are swapped for placeholders before anything reaches the model. Real values stay encrypted on this machine and are restored only inside an approved local tool."
        icon={ShieldCheck}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading || busy}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              Refresh
            </Button>
            {unlocked ? (
              <Button variant="secondary" size="sm" onClick={() => void handleLock()} disabled={busy}>
                <Lock className="h-3.5 w-3.5" />
                Lock vault
              </Button>
            ) : (
              <Button size="sm" onClick={() => setUnlockOpen(true)} disabled={loading}>
                <Unlock className="h-3.5 w-3.5" />
                {vault?.exists ? "Unlock vault" : "Create vault"}
              </Button>
            )}
          </>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Vault status"
          value={unlocked ? "Unlocked" : "Locked"}
          hint={unlocked ? "Values available to approved tools" : "Values inaccessible until unlocked"}
          icon={unlocked ? Unlock : LockKeyhole}
          accent={unlocked ? "emerald" : "amber"}
          delay={0}
        />
        <StatCard
          label="Protected fields"
          value={vault ? formatNumber(fields.length) : "—"}
          hint={unlocked ? "Placeholders in this session" : "Unlock to list placeholders"}
          icon={Fingerprint}
          delay={0.05}
        />
        <StatCard
          label="Distinct types"
          value={vault ? formatNumber(typeCounts.length) : "—"}
          hint="Aadhaar, PAN, phone, address…"
          icon={Database}
          accent="violet"
          delay={0.1}
        />
        <StatCard
          label="Last updated"
          value={vault?.updatedAt ? relativeTime(vault.updatedAt) : "—"}
          hint={vault?.exists ? "Encrypted file on disk" : "No vault file yet"}
          icon={KeyRound}
          accent="cyan"
          delay={0.15}
        />
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-[1.55fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-200">Stored placeholders</p>
              <p className="mt-0.5 text-[0.65rem] text-slate-500">
                Only placeholders are shown. The real values never reach this page.
              </p>
            </div>
            {vault?.exists ? (
              <Badge variant={unlocked ? "success" : "warning"} className="shrink-0">
                {unlocked ? "decrypted in memory" : "encrypted at rest"}
              </Badge>
            ) : null}
          </div>

          {error ? (
            <div className="p-4">
              <EmptyState
                icon={ShieldCheck}
                title="Vault unavailable"
                description={error}
                action={
                  <Button variant="secondary" onClick={() => void load()}>
                    Retry
                  </Button>
                }
              />
            </div>
          ) : loading && !vault ? (
            <div className="space-y-2 p-4">
              {[0, 1, 2].map((index) => (
                <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.03]" />
              ))}
            </div>
          ) : !vault?.exists ? (
            <div className="p-4">
              <EmptyState
                icon={LockKeyhole}
                title="No vault yet"
                description="Create a vault with a passphrase. It encrypts personal identifiers with AES-256-GCM and keeps the key only in server memory while unlocked."
                action={
                  <Button onClick={() => setUnlockOpen(true)}>
                    <Unlock className="h-3.5 w-3.5" /> Create vault
                  </Button>
                }
              />
            </div>
          ) : !unlocked ? (
            <div className="p-4">
              <EmptyState
                icon={LockKeyhole}
                title="Vault is locked"
                description="Unlock to view placeholder metadata. Sending a message that contains new personal data while locked is refused, so nothing is stored or sent to a model."
                action={
                  <Button onClick={() => setUnlockOpen(true)}>
                    <Unlock className="h-3.5 w-3.5" /> Unlock vault
                  </Button>
                }
              />
            </div>
          ) : fields.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Fingerprint}
                title="No personal details stored"
                description="When a message contains a detected identifier and the vault is unlocked, the value is encrypted here automatically and the model sees a placeholder like {{AADHAAR_1}}."
              />
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {fields.map((field, index) => (
                <motion.div
                  key={field.placeholder}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(index * 0.02, 0.2) }}
                  className="group flex items-center gap-3 px-4 py-3"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-cyan-400/20 bg-cyan-400/[0.06] font-mono text-[0.62rem] text-cyan-300">
                    {field.type.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="truncate font-mono text-[0.72rem] text-slate-200">
                        {field.placeholder}
                      </code>
                      <Badge variant="secondary" className="px-1.5 py-0 text-[0.52rem] uppercase tracking-wide">
                        {typeLabel(field.type)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[0.62rem] text-slate-500">
                      {field.label ? `${field.label} · ` : ""}
                      stored {relativeTime(field.createdAt)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-slate-500 opacity-0 transition-opacity hover:text-rose-300 group-hover:opacity-100"
                    onClick={() => setPendingForget(field)}
                    title={`Forget ${field.placeholder}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-3">
          <Card className="p-4">
            <p className="flex items-center gap-1.5 text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck className="h-3 w-3 text-emerald-400/80" /> How values are protected
            </p>
            <ul className="mt-3 space-y-2 text-[0.7rem] leading-relaxed text-slate-400">
              <li>Detected identifiers are replaced with placeholders before storage or model calls.</li>
              <li>Values are encrypted at rest with AES-256-GCM and a scrypt-derived key.</li>
              <li>The model and browser only ever see placeholders, never the real values.</li>
              <li>Restoration happens at the tool edge, and only for approved local tools.</li>
              <li>Cloud models never receive real values; unknown patterns route to the local model.</li>
            </ul>
          </Card>

          <Card className="p-4">
            <p className="text-[0.6rem] uppercase tracking-[0.18em] text-slate-500">Type breakdown</p>
            {typeCounts.length ? (
              <div className="mt-3 space-y-2">
                {typeCounts.map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between text-[0.68rem]">
                    <span className="text-slate-400">{typeLabel(type)}</span>
                    <span className="font-mono text-slate-300">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-500">
                Unlock the vault to see which identifier types are stored.
              </p>
            )}
          </Card>

          <Card className="border-rose-400/15 p-4">
            <p className="text-[0.6rem] uppercase tracking-[0.18em] text-rose-300/80">Danger zone</p>
            <p className="mt-2 text-[0.68rem] leading-relaxed text-slate-500">
              Wiping deletes the encrypted vault file and every stored value. Placeholders in old
              conversations stay, but they can no longer be restored.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="mt-3 w-full"
              onClick={() => setWipeOpen(true)}
              disabled={!vault?.exists || busy}
            >
              <Trash2 className="h-3.5 w-3.5" /> Wipe vault
            </Button>
          </Card>
        </div>
      </div>

      <Dialog
        open={unlockOpen}
        onOpenChange={(open) => {
          setUnlockOpen(open);
          if (!open) {
            setPassphrase("");
            setUnlockError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-cyan-300" />
              {vault?.exists ? "Unlock vault" : "Create vault"}
            </DialogTitle>
            <DialogDescription>
              {vault?.exists
                ? "Enter the passphrase you chose when this vault was created. A wrong passphrase is rejected without changing stored data."
                : "Choose a passphrase of at least 6 characters. It is not stored anywhere; without it the vault cannot be decrypted."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleUnlock} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="vault-passphrase">Passphrase</Label>
              <Input
                id="vault-passphrase"
                type="password"
                autoComplete="current-password"
                value={passphrase}
                onChange={(event) => {
                  setPassphrase(event.target.value);
                  setUnlockError(null);
                }}
                placeholder="At least 6 characters"
                autoFocus
              />
            </div>
            {unlockError ? (
              <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-[0.68rem] text-rose-200/90">
                {unlockError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setUnlockOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={passphrase.length < 6 || busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                {vault?.exists ? "Unlock" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={wipeOpen} onOpenChange={setWipeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Wipe the entire vault?</DialogTitle>
            <DialogDescription>
              This permanently deletes the encrypted file and every stored value. Existing
              placeholders in chat history will no longer be restorable. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setWipeOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleWipe()} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Wipe everything
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingForget)}
        onOpenChange={(open) => !open && setPendingForget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forget this field?</DialogTitle>
            <DialogDescription>
              {pendingForget?.placeholder} will be removed from the vault. Any placeholder with
              this name in older messages can no longer be restored by a tool.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPendingForget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleForget()} disabled={busy}>
              <Trash2 className="h-3.5 w-3.5" /> Forget field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
