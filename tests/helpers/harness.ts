import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Harness } from "@/harness/orchestrator";
import { createHarness } from "@/harness/orchestrator";
import { createLocalStorage } from "@/harness/storage/local";
import type { ServerConfig } from "@/harness/config";
import type { Storage } from "@/harness/storage/types";
import type { StreamEvent } from "@/harness/types";

export interface TestHarnessContext {
  harness: Harness;
  store: Storage;
  config: ServerConfig;
  dir: string;
  dataFile: string;
  workspaceDir: string;
  recreate: () => Promise<Harness>;
  cleanup: () => Promise<void>;
}

export function createTestConfig(
  ollamaUrl: string,
  overrides: Partial<ServerConfig> = {},
): ServerConfig {
  const workspaceDir =
    overrides.workspaceDir ?? path.join(os.tmpdir(), `jarvis-workspace-${Date.now()}`);
  return {
    openRouterSiteUrl: "http://localhost:3000",
    openRouterAppName: "JARVIS test",
    ollamaBaseUrl: ollamaUrl,
    localModel: "ollama:fake-chat",
    defaultModel: "ollama:fake-chat",
    maxIterations: 5,
    providerTimeoutMs: 4000,
    toolTimeoutMs: 2000,
    contextTokenBudget: 12000,
    memoryLimit: 5,
    workspaceDir,
    shellAllowlist: ["git", "node"],
    enableShell: false,
    ...overrides,
  };
}

export async function setupHarness(
  ollamaUrl: string,
  overrides: Partial<ServerConfig> = {},
): Promise<TestHarnessContext> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "jarvis-test-"));
  const dataFile = path.join(dir, "jarvis.json");
  const workspaceDir = path.join(dir, "workspace");
  const config = createTestConfig(ollamaUrl, { ...overrides, workspaceDir });

  const store = createLocalStorage({ dataFile });
  const harness = createHarness({ store, config });

  return {
    harness,
    store,
    config,
    dir,
    dataFile,
    workspaceDir,
    recreate: async () => {
      const freshStore = createLocalStorage({ dataFile });
      return createHarness({ store: freshStore, config });
    },
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    },
  };
}

export async function collectEvents(
  source: { events: AsyncGenerator<StreamEvent> },
): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of source.events) events.push(event);
  return events;
}

export function eventTypes(events: StreamEvent[]): string[] {
  return events.map((event) => event.type);
}

export function textFrom(events: StreamEvent[]): string {
  return events
    .filter((event): event is Extract<StreamEvent, { type: "delta" }> => event.type === "delta")
    .map((event) => event.text)
    .join("");
}

export function finalEvent(events: StreamEvent[]): Extract<StreamEvent, { type: "done" }> {
  const done = [...events].reverse().find((event) => event.type === "done");
  if (!done || done.type !== "done") throw new Error("No done event was emitted.");
  return done;
}
