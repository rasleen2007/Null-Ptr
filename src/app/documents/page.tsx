"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { cn, formatDate, formatFileSize } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DocumentCard } from "@/components/chat/document-card";

interface Document {
  id: string;
  name: string;
  type: "rti" | "form" | "scheme" | "pdf" | "other";
  size: number;
  createdAt: string;
  updatedAt: string;
  conversationId?: string;
  content?: string;
}

const TYPE_LABELS: Record<Document["type"], string> = {
  rti: "RTI Draft",
  form: "Form",
  scheme: "Scheme Summary",
  pdf: "PDF Document",
  other: "Document",
};

const TYPE_ICONS: Record<Document["type"], string> = {
  rti: "FileText",
  form: "FileText",
  scheme: "FolderOpen",
  pdf: "FileText",
  other: "FileText",
};

const TYPE_COLORS: Record<Document["type"], string> = {
  rti: "bg-amber-100 text-amber-700 border-amber-200",
  form: "bg-indigo-100 text-indigo-700 border-indigo-200",
  scheme: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pdf: "bg-violet-100 text-violet-700 border-violet-200",
  other: "bg-slate-100 text-slate-700 border-slate-200",
};

async function fetchDocuments(): Promise<Document[]> {
  try {
    const response = await fetch("/api/files", { cache: "no-store" });
    if (!response.ok) return [];
    const data = await response.json();
    return data.files || [];
  } catch {
    return [];
  }
}

async function deleteDocument(id: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
    return response.ok;
  } catch {
    return false;
  }
}

function DocumentRow({
  document,
  onDelete,
  onOpen,
}: {
  document: Document;
  onDelete: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const IconName = TYPE_ICONS[document.type];
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn("rounded-lg p-2", TYPE_COLORS[document.type])}>
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-slate-900 truncate max-w-xs">{document.name}</p>
            <p className="text-sm text-slate-500">
              <Badge variant="outline" className={cn("text-[0.55rem] h-4 px-2", TYPE_COLORS[document.type])}>
                {TYPE_LABELS[document.type]}
              </Badge>
            </p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 hidden md:table-cell text-sm text-slate-500">
        {formatFileSize(document.size)}
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-sm text-slate-500">
        {formatDate(document.updatedAt)}
      </td>
      <td className="px-4 py-3 text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onOpen(document.id)} className="flex items-center gap-2">
              <FolderOpen className="h-3.5 w-3.5" /> Open
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => window.open(`/api/files/${document.id}`, "_blank")} className="flex items-center gap-2">
              <Download className="h-3.5 w-3.5" /> Download
            </DropdownMenuItem>
            {document.conversationId ? (
              <DropdownMenuItem onClick={() => window.location.href = `/chat?conversation=${document.conversationId}`} className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5" /> View Conversation
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onDelete(document.id)} className="flex items-center gap-2 text-rose-600">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </td>
    </tr>
  );
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <FolderOpen className="h-16 w-16 text-slate-300 mb-4" />
      <h3 className="text-lg font-medium text-slate-900">No documents found</h3>
      <p className="mt-2 text-slate-500">
        {filter ? "Try adjusting your search or filter" : "Documents you generate will appear here"}
      </p>
      {!filter && (
        <Button className="mt-4" onClick={() => window.location.href = "/services"}>
          Generate Your First Document
        </Button>
      )}
    </div>
  );
}

function DocumentViewer({
  document,
  onClose,
}: {
  document: Document | null;
  onClose: () => void;
}) {
  if (!document) return null;

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="truncate">{document.name}</span>
            <Badge variant="outline" className={cn(TYPE_COLORS[document.type])}>
              {TYPE_LABELS[document.type]}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Created {formatDate(document.createdAt)} · {formatFileSize(document.size)}
            {document.conversationId && ` · From conversation ${document.conversationId.slice(0, 8)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[50vh] p-4 bg-slate-50 rounded-xl border border-slate-200">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 font-mono leading-relaxed">
            {document.content || "Loading content..."}
          </pre>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" /> Close
          </Button>
          <Button onClick={() => window.open(`/api/files/${document.id}`, "_blank")}>
            <Download className="h-4 w-4 mr-1" /> Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<Document["type"] | "all">("all");
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const docs = await fetchDocuments();
      setDocuments(docs);
      setLoading(false);
    }
    load();
  }, []);

  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(filter.toLowerCase());
    const matchesType = typeFilter === "all" || doc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const handleDelete = async (id: string) => {
    if (await deleteDocument(id)) {
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    }
    setDeleteConfirm(null);
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
              <h1 className="text-3xl font-bold text-slate-900">My Documents</h1>
              <p className="mt-1 text-slate-600">
                {documents.length} document{documents.length === 1 ? "" : "s"} · RTI drafts, forms, scheme summaries & more
              </p>
            </div>
            <Button onClick={() => window.location.href = "/services"} className="gap-2">
              <FileText className="h-4 w-4" /> New Document
            </Button>
          </div>
        </div>
      </header>

      {/* Toolbar */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search documents..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as Document["type"] | "all")}
                className="flex h-10 items-center px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">All Types</option>
                <option value="rti">RTI Drafts</option>
                <option value="form">Forms</option>
                <option value="scheme">Scheme Summaries</option>
                <option value="pdf">PDF Documents</option>
              </select>
              <Button variant="outline" onClick={() => { setFilter(""); setTypeFilter("all"); }} className="gap-2">
                <Filter className="h-3.5 w-3.5" /> Clear
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Document List */}
      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {filteredDocs.length === 0 ? (
          <EmptyState filter={filter} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm font-medium text-slate-500 border-b border-slate-200">
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3 hidden md:table-cell">Size</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Modified</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    document={doc}
                    onDelete={(id) => setDeleteConfirm(id)}
                    onOpen={(id) => {
                      const doc = documents.find((d) => d.id === id);
                      if (doc) setSelectedDoc(doc);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredDocs.length > 0 && (
          <div className="mt-6 flex items-center justify-between text-sm text-slate-500">
            <span>Showing {filteredDocs.length} of {documents.length} documents</span>
            <Badge variant="outline" className="gap-1">
              <ShieldCheck className="h-3 w-3" /> PII Protected
            </Badge>
          </div>
        )}
      </main>

      {/* Document Viewer Dialog */}
      <DocumentViewer document={selectedDoc} onClose={() => setSelectedDoc(null)} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this document? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}