import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk } from "@/lib/http";
import { resolveSandboxPath } from "@/harness/tools/sandbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const harness = await getHarness();
    const url = new URL(req.url);
    const pathParam = url.searchParams.get("path");

    if (!pathParam) {
      throw new HarnessError("Path parameter is required.", { status: 400, code: "invalid_body" });
    }

    const sandbox = resolveSandboxPath(harness.config.workspaceDir, pathParam);
    const config = harness.config;

    const { promises: fs } = await import("node:fs");
    const { existsSync } = await import("node:fs");

    if (!existsSync(sandbox.absolute)) {
      throw new HarnessError("File not found.", { status: 404, code: "not_found" });
    }

    const stat = await fs.stat(sandbox.absolute);
    if (!stat.isFile()) {
      throw new HarnessError("Not a file.", { status: 400, code: "invalid_body" });
    }

    const fileBuffer = await fs.readFile(sandbox.absolute);
    const ext = sandbox.absolute.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      txt: "text/plain",
      pdf: "application/pdf",
      json: "application/json",
      md: "text/markdown",
      html: "text/html",
      css: "text/css",
      js: "application/javascript",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      svg: "image/svg+xml",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";
    const filename = sandbox.absolute.split(/[\\/]/).pop() || "file";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}