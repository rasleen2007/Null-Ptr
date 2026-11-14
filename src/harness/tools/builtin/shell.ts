import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "../../types";
import { stringArg } from "../args";
import { resolveSandboxPath } from "../sandbox";

const FORBIDDEN_SHELL_PATTERNS = /[|&;<>()`$\r\n]/;
const FORBIDDEN_NODE_FLAGS = new Set(["-e", "--eval", "-p", "--print"]);

export function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < command.length; i += 1) {
    const char = command[i];
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error("Unterminated quote in command.");
  if (current) parts.push(current);
  return parts;
}

function baseExecutable(token: string): string {
  return path
    .basename(token)
    .toLowerCase()
    .replace(/\.(exe|cmd|bat|ps1)$/i, "");
}

export const shellCommandTool: ToolDefinition = {
  name: "shell_command",
  description:
    "Run a single allowlisted command (no shell) inside the JARVIS workspace sandbox. Disabled by default; every invocation requires explicit user approval. Shell operators, pipes, redirects, and command substitution are rejected. Default allowlist: git, node (configurable).",
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "Full command line, e.g. \"git status --short\". No shell operators.",
      },
    },
    required: ["command"],
  },
  category: "system",
  sensitivity: "sensitive",
  async execute(args, ctx) {
    const command = stringArg(args, "command", { required: true, max: 1000 });
    if (FORBIDDEN_SHELL_PATTERNS.test(command)) {
      return {
        content:
          "Command rejected: shell operators (pipes, redirects, chaining, substitution) are not allowed.",
        isError: true,
      };
    }
    let parts: string[];
    try {
      parts = splitCommand(command);
    } catch (error) {
      return { content: (error as Error).message, isError: true };
    }
    if (!parts.length) return { content: "Empty command.", isError: true };

    const executable = baseExecutable(parts[0]);
    const allowlist = ctx.shellAllowlist.map((entry) => entry.toLowerCase());
    if (!allowlist.includes(executable) && !allowlist.includes(parts[0].toLowerCase())) {
      return {
        content: `Command "${parts[0]}" is not allowlisted. Allowed: ${ctx.shellAllowlist.join(", ")}.`,
        isError: true,
      };
    }
    if (executable === "node" && parts.slice(1).some((arg) => FORBIDDEN_NODE_FLAGS.has(arg))) {
      return {
        content: "Inline node evaluation (-e/--eval/-p/--print) is blocked. Write a script file instead.",
        isError: true,
      };
    }

    const sandbox = resolveSandboxPath(ctx.workspaceDir, ".");
    await fs.mkdir(sandbox.root, { recursive: true });

    return new Promise((resolve) => {
      execFile(
        parts[0],
        parts.slice(1),
        {
          cwd: sandbox.root,
          timeout: ctx.toolTimeoutMs,
          maxBuffer: 1024 * 1024,
          windowsHide: true,
          signal: ctx.signal,
        },
        (error, stdout, stderr) => {
          const output = `stdout:\n${stdout || "(empty)"}\n\nstderr:\n${stderr || "(empty)"}`;
          if (error) {
            const code = (error as NodeJS.ErrnoException).code;
            const timedOut = code === "ETIMEDOUT" || /timed out/i.test(error.message);
            resolve({
              content: `${timedOut ? "Command timed out." : `Command failed: ${error.message}`}\n\n${output}`,
              isError: true,
              data: { exitCode: typeof code === "number" ? code : undefined },
            });
            return;
          }
          resolve({
            content: output,
            data: { exitCode: 0 },
          });
        },
      );
    });
  },
};


