import { describe, expect, it } from "vitest";
import type { AppSettings } from "@/harness/types";
import { DEFAULT_SETTINGS } from "@/harness/config";
import {
  createToolRegistry,
  getToolAvailability,
  requiresApproval,
} from "@/harness/tools/registry";

function settings(overrides: {
  permissions?: Partial<AppSettings["permissions"]>;
  toolsEnabled?: boolean;
  memoryEnabled?: boolean;
} = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    toolsEnabled: overrides.toolsEnabled ?? DEFAULT_SETTINGS.toolsEnabled,
    memoryEnabled: overrides.memoryEnabled ?? DEFAULT_SETTINGS.memoryEnabled,
    permissions: { ...DEFAULT_SETTINGS.permissions, ...overrides.permissions },
    updatedAt: new Date().toISOString(),
  };
}

describe("getToolAvailability", () => {
  it("disables every tool when tools are off", () => {
    const result = getToolAvailability(
      { name: "calculator", category: "utility" },
      settings({ toolsEnabled: false }),
      { enableShell: true },
    );
    expect(result.enabled).toBe(false);
    expect(result.reason).toMatch(/disabled in settings/i);
  });

  it("gates sensitive categories behind permissions", () => {
    const write = getToolAvailability(
      { name: "file_write", category: "filesystem" },
      settings(),
      { enableShell: false },
    );
    expect(write.enabled).toBe(false);
    expect(write.reason).toMatch(/allowFileWrite/);

    const shell = getToolAvailability(
      { name: "shell_command", category: "system" },
      settings(),
      { enableShell: true },
    );
    expect(shell.enabled).toBe(false);
    expect(shell.reason).toMatch(/allowShell/);
  });

  it("requires both the shell permission and environment enablement", () => {
    const enabledSettings = settings({ permissions: { allowShell: true } });
    expect(
      getToolAvailability({ name: "shell_command", category: "system" }, enabledSettings, {
        enableShell: false,
      }).reason,
    ).toMatch(/JARVIS_ENABLE_SHELL/);
    expect(
      getToolAvailability({ name: "shell_command", category: "system" }, enabledSettings, {
        enableShell: true,
      }).enabled,
    ).toBe(true);
  });

  it("disables memory writing when long-term memory is off", () => {
    const result = getToolAvailability(
      { name: "memory_save", category: "memory" },
      settings({ memoryEnabled: false, permissions: { allowMemoryWrite: true } }),
      { enableShell: false },
    );
    expect(result.enabled).toBe(false);
    expect(result.reason).toMatch(/memory is disabled/i);
  });

  it("allows safe tools by default", () => {
    expect(
      getToolAvailability({ name: "calculator", category: "utility" }, settings(), {
        enableShell: false,
      }).enabled,
    ).toBe(true);
  });
});

describe("requiresApproval", () => {
  it("requires approval only for sensitive tools", () => {
    expect(requiresApproval({ sensitivity: "sensitive" })).toBe(true);
    expect(requiresApproval({ sensitivity: "safe" })).toBe(false);
  });
});

describe("createToolRegistry", () => {
  it("exposes tool metadata with availability reasons", () => {
    const registry = createToolRegistry({ enableShell: false });
    const infos = registry.infos(settings());
    const byName = new Map(infos.map((info) => [info.name, info]));

    expect(byName.get("calculator")?.enabled).toBe(true);
    expect(byName.get("memory_search")?.enabled).toBe(true);
    expect(byName.get("file_read")?.enabled).toBe(true);
    expect(byName.get("file_write")?.enabled).toBe(false);
    expect(byName.get("shell_command")?.enabled).toBe(false);
    expect(byName.get("shell_command")?.sensitivity).toBe("sensitive");
  });

  it("filters tools for models without tool support", () => {
    const registry = createToolRegistry({ enableShell: false });
    const withoutTools = registry.availableForModel(settings(), {
      id: "openrouter:google/gemma-3-27b-it:free",
      provider: "openrouter",
      model: "google/gemma-3-27b-it:free",
      label: "Gemma",
      description: "",
      contextWindow: 1000,
      supportsTools: false,
      free: true,
      tags: [],
    });
    expect(withoutTools).toHaveLength(0);
  });
});
