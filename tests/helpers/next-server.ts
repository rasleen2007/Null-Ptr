import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export interface NextServer {
  baseUrl: string;
  process: ChildProcess;
  tempRoot: string;
  dataFile: string;
  workspaceDir: string;
  logs: () => string;
  stop: () => Promise<void>;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a port."));
        return;
      }
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

async function waitForExit(child: ChildProcess, timeoutMs: number): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function startNextServer(overrides: Record<string, string> = {}): Promise<NextServer> {
  const buildId = path.join(process.cwd(), ".next", "BUILD_ID");
  try {
    await fs.access(buildId);
  } catch {
    throw new Error("Production build missing. Run `npm run build` before the API E2E suite.");
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-e2e-"));
  const workspaceDir = path.join(tempRoot, "workspace");
  await fs.mkdir(workspaceDir, { recursive: true });
  const dataFile = path.join(tempRoot, "jarvis.json");
  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const logs: string[] = [];
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    SAATHI_DATA_FILE: dataFile,
    SAATHI_WORKSPACE_DIR: workspaceDir,
    SAATHI_VAULT_FILE: path.join(tempRoot, "vault.enc.json"),
    SAATHI_ACCESS_TOKEN: "e2e-secret-token",
    SAATHI_DEFAULT_MODEL: "ollama:fake-chat",
    SAATHI_RATE_LIMIT_MAX: "1000",
    SAATHI_CHAT_RATE_LIMIT_MAX: "1000",
    SAATHI_RATE_LIMIT_WINDOW_MS: "60000",
    SAATHI_ENABLE_SHELL: "false",
    GEMINI_API_KEY: "",
    GROQ_API_KEY: "",
    OPENROUTER_API_KEY: "",
    SUPABASE_URL: "",
    SUPABASE_SERVICE_ROLE_KEY: "",
    ...overrides,
  };

  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: process.cwd(),
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));
  child.stderr?.on("data", (chunk: Buffer) => logs.push(chunk.toString("utf8")));

  const deadline = Date.now() + 90_000;
  let healthy = false;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited early.\n${logs.join("")}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { cache: "no-store" });
      if (response.ok) {
        healthy = true;
        break;
      }
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  if (!healthy) {
    child.kill();
    throw new Error(`Next.js server did not become healthy.\n${logs.join("")}`);
  }

  const stop = async () => {
    if (child.exitCode === null && process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else if (child.exitCode === null) {
      child.kill("SIGTERM");
    }
    await waitForExit(child, 5000);
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  };

  return {
    baseUrl,
    process: child,
    tempRoot,
    dataFile,
    workspaceDir,
    logs: () => logs.join(""),
    stop,
  };
}

export async function readSse(
  response: Response,
  onEvent?: (event: Record<string, unknown>) => void | Promise<void>,
): Promise<Record<string, unknown>[]> {
  if (!response.body) throw new Error("SSE response had no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, unknown>[] = [];
  let buffer = "";

  const parseBlock = async (block: string) => {
    const data = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) return;
    const parsed = JSON.parse(data) as Record<string, unknown>;
    events.push(parsed);
    if (onEvent) await onEvent(parsed);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      await parseBlock(block);
      boundary = buffer.indexOf("\n\n");
    }
  }
  if (buffer.trim()) await parseBlock(buffer);
  return events;
}

export function finalEvent(events: Record<string, unknown>[]): Record<string, unknown> {
  const done = [...events].reverse().find((event) => event.type === "done");
  if (!done) throw new Error(`No done event found in ${JSON.stringify(events)}`);
  return done;
}

export function textFrom(events: Record<string, unknown>[]): string {
  return events
    .filter((event) => event.type === "delta")
    .map((event) => String(event.text ?? ""))
    .join("");
}
