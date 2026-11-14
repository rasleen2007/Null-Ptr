"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  X,
} from "lucide-react";
import { cn, formatDate, formatRelativeTime, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VaultControl } from "@/components/vault/vault-control";

interface VaultStatus {
  locked: boolean;
  vaultPath: string;
  masterKeyExists: boolean;
  sizeBytes: number;
  fileCount: number;
  lastModified: string | null;
}

interface RedactionLog {
  id: string;
  timestamp: string;
  conversationId: string;
  originalText: string;
  redactedText: string;
  placeholders: string[];
  types: string[];
  route: "ollama" | "cloud";
  verifiedClean: boolean;
}

interface PrivacyStats {
  totalRedactions: number;
  totalConversations: number;
  localOnlyTurns: number;
  cloudTurns: number;
  lastRedaction: string | null;
}

const PII_TYPE_LABEL: Record<string, string> = {
  aadhaar: "Aadhaar Number",
  pan: "PAN",
  phone: "Phone Number",
  email: "Email Address",
  ifsc: "IFSC Code",
  upi: "UPI ID",
  account: "Bank Account",
  dob: "Date of Birth",
  address: "Address",
  name: "Person Name",
  other: "Other Identifier",
};

async function fetchVaultStatus(): Promise<VaultStatus | null> {
  try {
    const response = await fetch("/api/vault/status", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchRedactionLogs(): Promise<RedactionLog[]> {
  try {
    const response = await fetch("/api/privacy/redactions", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.logs || [];
  } catch {
    return [];
  }
}

async function fetchPrivacyStats(): Promise<PrivacyStats | null> {
  try {
    const response = await fetch("/api/privacy/stats", { cache: "no-store" });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function unlockVault(password: string): Promise<boolean> {
  try {
    const response = await fetch("/api/vault/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function lockVault(): Promise<boolean> {
  try {
    const response = await fetch("/api/vault/lock", { method: "POST" });
    return response.ok;
  } catch {
    return false;
  }
}

async function clearRedactionLogs(): Promise<boolean> {
  try {
    const response = await fetch("/api/privacy/redactions", { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

function StatusIndicator({ locked, onUnlock, onLock }: { locked: boolean; onUnlock: (pwd: string) => void; onLock: () => void }) {
  const [unlocking, setUnlocking] = useState(false);
  const [password, setPassword] = useState("");

  if (locked) {
    return (
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-amber-800">
            <Database className="h-5 w-5" /> Vault Locked
          </CardTitle>
          <CardDescription>Your encrypted vault is currently locked. Unlock to access stored data.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter vault password"
              className="flex-1 h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm"
              onKeyDown={(e) => e.key === "Enter" && password && !unlocking && onUnlock(password)}
            />
            <Button onClick={() => password && !unlocking && onUnlock(password)} disabled={unlocking || !password}>
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-emerald-200 bg-emerald-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-emerald-800">
          <ShieldCheck className="h-5 w-5" /> Vault Unlocked
        </CardTitle>
        <CardDescription>Your encrypted vault is accessible. Data is protected at rest with AES-256-GCM.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="outline" onClick={onLock} className="gap-2">
          <Database className="h-4 w-4" /> Lock Vault
        </Button>
      </CardContent>
    </Card>
  );
}

function PrivacyPrinciple({ icon: Icon, title, description, status }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; status: "active" | "partial" | "inactive" }) {
  const statusConfig = {
    active: { color: "text-emerald-600 bg-emerald-50 border-emerald-200", label: "Active", icon: CheckCircle2 },
    partial: { color: "text-amber-600 bg-amber-50 border-amber-200", label: "Partial", icon: AlertTriangle },
    inactive: { color: "text-slate-500 bg-slate-50 border-slate-200", label: "Inactive", icon: X },
  };
  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <Card className={cn("border", config.color)}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-4">
          <div className={cn("rounded-xl p-3", config.color)}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900">{title}</h3>
              <Badge variant="outline" className={cn("text-[0.55rem] h-4 px-2", config.color)}>
                <StatusIcon className="h-3 w-3" /> {config.label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RedactionLogRow({ log }: { log: RedactionLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-slate-600">{log.id.slice(0, 8)}</span>
          <Badge variant="outline" className={cn("text-[0.55rem] h-4 px-2", log.route === "ollama" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-indigo-50 text-indigo-700 border-indigo-200")}>
            {log.route === "ollama" ? <Cpu className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />} {log.route}
          </Badge>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">
        {formatRelativeTime(log.timestamp)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {log.types.slice(0, 3).map((type) => (
            <Badge key={type} variant="secondary" className="text-[0.55rem] h-4 px-2">
              {PII_TYPE_LABEL[type] ?? type}
            </Badge>
          ))}
          {log.types.length > 3 && (
            <Badge variant="secondary" className="text-[0.55rem] h-4 px-2">+{log.types.length - 3}</Badge>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-slate-500">
        {log.placeholders.length} placeholder{log.placeholders.length === 1 ? "" : "s"}
      </td>
      <td className="px-4 py-3">
        <Badge variant={log.verifiedClean ? "success" : "danger"} className="gap-1 text-[0.55rem] h-4 px-2">
          {log.verifiedClean ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
          {log.verifiedClean ? "Clean" : "Residual PII"}
        </Badge>
      </td>
      <td className="px-4 py-3 text-right">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpanded(!expanded)}>
          {expanded ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      </td>
    </tr>
  );
}

function RedactionLogDetail({ log }: { log: RedactionLog }) {
  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate font-mono text-sm">Redaction Log {log.id.slice(0, 12)}</span>
            <Badge variant="outline" className={log.route === "ollama" ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-indigo-50 text-indigo-700 border-indigo-200"}>
              {log.route === "ollama" ? <Cpu className="h-3 w-3 mr-1" /> : <Shield className="h-3 w-3 mr-1" />} {log.route}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto max-h-[60vh] p-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-slate-500">Timestamp</p>
              <p className="font-mono">{formatDate(log.timestamp)}</p>
            </div>
            <div>
              <p className="text-slate-500">Conversation</p>
              <p className="font-mono">{log.conversationId.slice(0, 12)}</p>
            </div>
            <div>
              <p className="text-slate-500">PII Types</p>
              <p>{log.types.map((t) => PII_TYPE_LABEL[t] ?? t).join(", ")}</p>
            </div>
            <div>
              <p className="text-slate-500">Placeholders</p>
              <p className="font-mono text-xs">{log.placeholders.join(", ")}</p>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-500 mb-2">Original Text</p>
            <pre className="bg-slate-100 rounded p-3 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap">{log.originalText}</pre>
          </div>
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-medium text-slate-500 mb-2">Redacted Text</p>
            <pre className="bg-emerald-50 rounded p-3 text-xs overflow-x-auto max-h-40 whitespace-pre-wrap">{log.redactedText}</pre>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => {}}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PrivacyPage() {
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | null>(null);
  const [redactionLogs, setRedactionLogs] = useState<RedactionLog[]>([]);
  const [privacyStats, setPrivacyStats] = useState<PrivacyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [vault, logs, stats] = await Promise.all([
        fetchVaultStatus(),
        fetchRedactionLogs(),
        fetchPrivacyStats(),
      ]);
      setVaultStatus(vault);
      setRedactionLogs(logs);
      setPrivacyStats(stats);
      setLoading(false);
    }
    load();
  }, []);

  const handleUnlock = async (password: string) => {
    if (await unlockVault(password)) {
      setVaultStatus((prev) => prev ? { ...prev, locked: false } : null);
    }
    setUnlockPassword("");
  };

  const handleLock = async () => {
    if (await lockVault()) {
      setVaultStatus((prev) => prev ? { ...prev, locked: true } : null);
    }
  };

  const handleClearLogs = async () => {
    if (await clearRedactionLogs()) {
      setRedactionLogs([]);
      setPrivacyStats((prev) => prev ? { ...prev, totalRedactions: 0, lastRedaction: null } : null);
    }
    setShowClearConfirm(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-16 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Privacy Center</h1>
              <p className="mt-1 text-slate-600">Your data sovereignty dashboard — vault status, PII redaction logs, and privacy controls</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => window.location.reload()} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
              <VaultControl />
            </div>
          </div>
        </div>
      </header>

      {/* Vault Status */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            {vaultStatus && (
              <StatusIndicator
                locked={vaultStatus.locked}
                onUnlock={handleUnlock}
                onLock={handleLock}
              />
            )}
            {!vaultStatus && (
              <Card className="border-slate-200 bg-slate-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-slate-800">
                    <Database className="h-5 w-5" /> Vault Status Unavailable
                  </CardTitle>
                  <CardDescription>Could not connect to vault service. Check if the backend is running.</CardDescription>
                </CardHeader>
              </Card>
            )}
          </div>
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Encrypted Files</span>
                  <span className="font-mono font-semibold text-slate-900">{vaultStatus?.fileCount ?? 0}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total Size</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {vaultStatus ? (vaultStatus.sizeBytes / 1024).toFixed(1) + " KB" : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Last Modified</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {vaultStatus?.lastModified ? formatDate(vaultStatus.lastModified) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Master Key</span>
                  <Badge variant={vaultStatus?.masterKeyExists ? "success" : "danger"} className="gap-1">
                    {vaultStatus?.masterKeyExists ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {vaultStatus?.masterKeyExists ? "Configured" : "Missing"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Privacy Principles */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Privacy Principles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <PrivacyPrinciple
            icon={ShieldCheck}
            title="PII Redaction"
            description="Aadhaar, PAN, phone, email, and other identifiers are automatically detected and replaced with placeholders before any cloud processing."
            status="active"
          />
          <PrivacyPrinciple
            icon={Cpu}
            title="Local-First Processing"
            description="Turns containing unknown personal data stay on local models (Ollama). Nothing leaves your device without explicit consent."
            status="active"
          />
          <PrivacyPrinciple
            icon={User}
            title="User Approval Gates"
            description="All tool executions that modify state or access external APIs require explicit user approval before running."
            status="active"
          />
          <PrivacyPrinciple
            icon={Database}
            title="Encrypted Vault"
            description="Conversation history and memories are encrypted at rest with AES-256-GCM. Keys never leave your control."
            status="active"
          />
        </div>
      </section>

      {/* Redaction Statistics */}
      {privacyStats && (
        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Redaction Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl p-3 bg-indigo-100">
                    <ShieldCheck className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{privacyStats.totalRedactions.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">Total Redactions</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl p-3 bg-emerald-100">
                    <User className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{privacyStats.totalConversations.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">Conversations Protected</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl p-3 bg-violet-100">
                    <Cpu className="h-6 w-6 text-violet-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{privacyStats.localOnlyTurns.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">Local-Only Turns</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl p-3 bg-amber-100">
                    <Shield className="h-6 w-6 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{privacyStats.cloudTurns.toLocaleString()}</p>
                    <p className="text-sm text-slate-500">Cloud Turns (Verified Clean)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Redaction Logs */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-slate-900">PII Redaction Log</h2>
          <div className="flex gap-2">
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> {redactionLogs.length} entries
            </Badge>
            {redactionLogs.length > 0 && (
              <Button variant="outline" onClick={() => setShowClearConfirm(true)} className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50">
                <Trash2 className="h-4 w-4" /> Clear Log
              </Button>
            )}
          </div>
        </div>

        {redactionLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ShieldCheck className="h-12 w-12 mx-auto text-emerald-300 mb-3" />
              <h3 className="text-lg font-medium text-slate-900">No redactions yet</h3>
              <p className="mt-1 text-slate-500">PII redaction events will appear here as you use the assistant</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm font-medium text-slate-500 border-b border-slate-200 bg-slate-50">
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3 hidden md:table-cell">Time</th>
                    <th className="px-4 py-3">PII Types</th>
                    <th className="px-4 py-3">Placeholders</th>
                    <th className="px-4 py-3">Verification</th>
                    <th className="px-4 py-3 text-right">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {redactionLogs.slice(0, 50).map((log) => (
                    <RedactionLogRow key={log.id} log={log} />
                  ))}
                </tbody>
              </table>
            </div>
            {redactionLogs.length > 50 && (
              <CardFooter className="py-3">
                <p className="text-sm text-slate-500 text-center">Showing 50 of {redactionLogs.length} entries</p>
              </CardFooter>
            )}
          </Card>
        )}
      </section>

      {/* Data Controls */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 border-t border-slate-200">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Data Controls</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-rose-200 bg-rose-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-rose-800">
                <Trash2 className="h-5 w-5" /> Clear All Data
              </CardTitle>
              <CardDescription>Permanently delete vault, conversations, memories, and redaction logs</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="w-full gap-2">
                <Trash2 className="h-4 w-4" /> Delete Everything
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Export Privacy Report</CardTitle>
              <CardDescription>Download a JSON report of all redaction activity and vault status</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full gap-2">
                <Download className="h-4 w-4" /> Export Report
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">Audit Trail</CardTitle>
              <CardDescription>View detailed logs of all privacy-relevant operations</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full gap-2" onClick={() => window.location.href = "/activity"}>
                <ArrowRight className="h-4 w-4" /> View Activity
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer Note */}
      <footer className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 border-t border-slate-200">
        <div className="rounded-xl bg-slate-50 p-6">
          <div className="flex items-start gap-4">
            <ShieldCheck className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-slate-900">Your Privacy, Your Control</h3>
              <p className="mt-2 text-sm text-slate-600">
                Sarkari Saathi is built on a privacy-first architecture. Your personal identifiers are never sent to cloud
                providers without being redacted. Local models handle sensitive conversations entirely on your device.
                You own your data — we just help you use it safely with government services.
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}