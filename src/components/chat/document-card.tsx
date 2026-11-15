"use client";

import { useState } from "react";
import { Download, FileText, FileType, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface DocumentCardProps {
  type: "rti" | "pdf";
  title: string;
  path: string;
  preview?: string;
  bytes?: number;
  language?: string;
  onDismiss?: () => void;
}

export function DocumentCard({ type, title, path, preview, bytes, language, onDismiss }: DocumentCardProps) {
  const [expanded, setExpanded] = useState(false);

  const formatBytes = (b?: number) => {
    if (!b) return "";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = path.split("/").pop() || title;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch {
      // Fallback: open in new tab
      window.open(`/api/files?path=${encodeURIComponent(path)}`, "_blank");
    }
  };

  return (
    <Card className={cn("w-full max-w-md", !expanded && "overflow-hidden")}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              type === "rti"
                ? "bg-blue-50 text-blue-600"
                : "bg-violet-50 text-violet-600",
            )}
          >
            {type === "rti" ? <FileText className="h-5 w-5" /> : <FileType className="h-5 w-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[0.58rem] text-slate-500">
                  <span className="font-mono truncate">{path}</span>
                  {bytes && <span>{formatBytes(bytes)}</span>}
                  {language && (
                    <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono">
                      {language}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={handleDownload}
                  title="Download"
                  aria-label="Download document"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => window.open(`/api/files?path=${encodeURIComponent(path)}`, "_blank")}
                  title="Open in new tab"
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
                {onDismiss && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-slate-500 hover:text-rose-600"
                    onClick={onDismiss}
                    title="Dismiss"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {preview && (
              <div className={cn("mt-2 transition-all", expanded ? "max-h-64" : "max-h-20")}>
                <div className="overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[0.6rem] text-slate-700">
                  {expanded ? preview : `${preview.slice(0, 300)}${preview.length > 300 ? "…" : ""}`}
                </div>
                {preview.length > 300 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1.5 text-[0.62rem]"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? "Show less" : "Show more"}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DocumentCardList({ documents }: { documents: Array<DocumentCardProps> }) {
  if (!documents.length) return null;

  return (
    <div className="space-y-2">
      {documents.map((doc, index) => (
        <DocumentCard key={`${doc.path}-${index}`} {...doc} />
      ))}
    </div>
  );
}