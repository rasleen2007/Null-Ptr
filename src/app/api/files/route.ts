import path from "node:path";
import { promises as fs, existsSync } from "node:fs";
import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { resolveSandboxPath } from "@/harness/tools/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  json: "application/json",
  md: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
};

type DocumentType = "rti" | "form" | "scheme" | "pdf" | "other";

interface WorkspaceDocument {
  id: string;
  path: string;
  name: string;
  type: DocumentType;
  size: number;
  createdAt: string;
  updatedAt: string;
}

function inferType(relativePath: string): DocumentType {
  const normalized = relativePath.toLowerCase().replace(/\\/g, "/");
  const ext = path.extname(normalized).slice(1);
  if (ext === "pdf") return "pdf";
  if (normalized.startsWith("rti/") || normalized.includes("rti")) return "rti";
  if (normalized.startsWith("forms/") || normalized.includes("form")) return "form";
  if (normalized.startsWith("schemes/") || normalized.includes("scheme")) return "scheme";
  return "other";
}

async function listWorkspaceDocuments(root: string): Promise<WorkspaceDocument[]> {
  const documents: WorkspaceDocument[] = [];

  async function walk(directory: string, depth: number): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < 4) await walk(absolute, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        const stat = await fs.stat(absolute);
        const relative = path.relative(root, absolute).split(path.sep).join("/");
        documents.push({
          id: relative,
          path: relative,
          name: path.basename(absolute),
          type: inferType(relative),
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        // File vanished between readdir and stat; skip it.
      }
    }
  }

  await walk(root, 0);
  return documents.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function GET(req: Request) {
  try {
    const harness = await getHarness();
    const url = new URL(req.url);
    const pathParam = url.searchParams.get("path");

    if (!pathParam) {
      const root = resolveSandboxPath(harness.config.workspaceDir, ".").absolute;
      const files = await listWorkspaceDocuments(root);
      return jsonOk({ files, documents: files, workspace: harness.config.workspaceDir });
    }

    const sandbox = resolveSandboxPath(harness.config.workspaceDir, pathParam);

    if (!existsSync(sandbox.absolute)) {
      throw new HarnessError("File not found.", { status: 404, code: "not_found" });
    }

    const stat = await fs.stat(sandbox.absolute);
    if (!stat.isFile()) {
      throw new HarnessError("Not a file.", { status: 400, code: "invalid_body" });
    }

    const fileBuffer = await fs.readFile(sandbox.absolute);
    const ext = sandbox.absolute.split(".").pop()?.toLowerCase() || "";
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    const filename = sandbox.absolute.split(/[\\/]/).pop() || "file";
    const download = url.searchParams.get("download") === "1";

    return new Response(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const harness = await getHarness();
    const url = new URL(req.url);
    const pathParam = url.searchParams.get("path");
    if (!pathParam) {
      throw new HarnessError("Path parameter is required.", { status: 400, code: "invalid_body" });
    }

    const sandbox = resolveSandboxPath(harness.config.workspaceDir, pathParam);
    if (!sandbox.relative || sandbox.relative === ".") {
      throw new HarnessError("Cannot delete the workspace root.", {
        status: 400,
        code: "invalid_body",
      });
    }
    if (!existsSync(sandbox.absolute)) {
      throw new HarnessError("File not found.", { status: 404, code: "not_found" });
    }
    const stat = await fs.stat(sandbox.absolute);
    if (!stat.isFile()) {
      throw new HarnessError("Only files can be deleted.", { status: 400, code: "invalid_body" });
    }

    await fs.unlink(sandbox.absolute);
    return jsonOk({ deleted: true, path: sandbox.relative });
  } catch (error) {
    return jsonError(error);
  }
}
