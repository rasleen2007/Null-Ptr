import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../../types";
import { numberArg, stringArg } from "../args";
import { resolveSandboxPath } from "../sandbox";

function describeEntries(root: string, entries: string[]): string[] {
  return entries.map((entry) => entry.split(path.sep).join("/"));
}

export const fileListTool: ToolDefinition = {
  name: "file_list",
  description:
    "List files inside the JARVIS workspace sandbox. Paths are relative to the workspace root. Never touches files outside the sandbox.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative directory path. Defaults to the workspace root." },
      depth: { type: "number", description: "Recursion depth, 0-3. Default 1." },
    },
  },
  category: "filesystem",
  sensitivity: "safe",
  async execute(args, ctx) {
    const target = stringArg(args, "path", { fallback: ".", max: 300 });
    const depth = numberArg(args, "depth", { min: 0, max: 3, fallback: 1 });
    const sandbox = resolveSandboxPath(ctx.workspaceDir, target);
    await fs.mkdir(sandbox.root, { recursive: true });

    const output: string[] = [];
    const limit = 200;

    async function walk(current: string, currentDepth: number) {
      if (output.length >= limit) return;
      const dirents = await fs.readdir(current, { withFileTypes: true });
      for (const dirent of dirents) {
        if (output.length >= limit) return;
        const absolute = path.join(current, dirent.name);
        const relative = path.relative(sandbox.root, absolute);
        if (dirent.isDirectory()) {
          output.push(`${describeEntries(sandbox.root, [relative])[0]}/`);
          if (currentDepth < depth) await walk(absolute, currentDepth + 1);
        } else {
          const stat = await fs.stat(absolute).catch(() => null);
          output.push(
            `${describeEntries(sandbox.root, [relative])[0]}${stat ? ` (${stat.size} bytes)` : ""}`,
          );
        }
      }
    }

    const stat = await fs.stat(sandbox.absolute).catch(() => null);
    if (!stat) return { content: `Directory not found: ${sandbox.relative}`, isError: true };
    if (!stat.isDirectory()) return { content: `Not a directory: ${sandbox.relative}`, isError: true };

    await walk(sandbox.absolute, 0);
    return {
      content: JSON.stringify({
        root: ctx.workspaceDir,
        path: sandbox.relative,
        entries: output,
        truncated: output.length >= limit,
      }),
    };
  },
};

export const fileReadTool: ToolDefinition = {
  name: "file_read",
  description:
    "Read a UTF-8 text file from inside the JARVIS workspace sandbox. Files larger than maxBytes are truncated.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path inside the workspace." },
      maxBytes: { type: "number", description: "Maximum bytes to read (1-100000). Default 20000." },
    },
    required: ["path"],
  },
  category: "filesystem",
  sensitivity: "safe",
  async execute(args, ctx) {
    const target = stringArg(args, "path", { required: true, max: 300 });
    const maxBytes = numberArg(args, "maxBytes", { min: 1, max: 100_000, fallback: 20_000 });
    const sandbox = resolveSandboxPath(ctx.workspaceDir, target);
    const stat = await fs.stat(sandbox.absolute).catch(() => null);
    if (!stat) return { content: `File not found: ${sandbox.relative}`, isError: true };
    if (!stat.isFile()) return { content: `Not a file: ${sandbox.relative}`, isError: true };
    const handle = await fs.open(sandbox.absolute, "r");
    try {
      const buffer = Buffer.alloc(Math.min(maxBytes, stat.size));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      const text = buffer.subarray(0, bytesRead).toString("utf8");
      const binary = text.includes("\u0000");
      return {
        content: JSON.stringify({
          path: sandbox.relative,
          bytes: bytesRead,
          truncated: stat.size > bytesRead,
          binary,
          content: binary ? "[binary content omitted]" : text,
        }),
      };
    } finally {
      await handle.close();
    }
  },
};

export const fileWriteTool: ToolDefinition = {
  name: "file_write",
  description:
    "Write or append UTF-8 text to a file inside the JARVIS workspace sandbox. This is a sensitive operation and always requires explicit user approval.",
  parameters: {
    type: "object",
    properties: {
      path: { type: "string", description: "Relative file path inside the workspace." },
      content: { type: "string", description: "Text content to write (max 200000 characters)." },
      mode: {
        type: "string",
        description: "Write mode: \"overwrite\" (default) or \"append\".",
        enum: ["overwrite", "append"],
      },
    },
    required: ["path", "content"],
  },
  category: "filesystem",
  sensitivity: "sensitive",
  async execute(args, ctx) {
    const target = stringArg(args, "path", { required: true, max: 300 });
    const content = stringArg(args, "content", { max: 200_000 });
    const mode = args.mode === "append" ? "append" : "overwrite";
    const sandbox = resolveSandboxPath(ctx.workspaceDir, target);
    if (sandbox.relative === ".") {
      return { content: "Refusing to write to the workspace root.", isError: true };
    }
    await fs.mkdir(path.dirname(sandbox.absolute), { recursive: true });
    await fs.writeFile(sandbox.absolute, content, {
      encoding: "utf8",
      flag: mode === "append" ? "a" : "w",
    });
    return {
      content: JSON.stringify({
        written: true,
        path: sandbox.relative,
        mode,
        bytes: Buffer.byteLength(content, "utf8"),
      }),
    };
  },
};

export const fileTools = [fileListTool, fileReadTool, fileWriteTool];


