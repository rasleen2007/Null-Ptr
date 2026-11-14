import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DEFAULT_SETTINGS } from "@/harness/config";
import { createToolRegistry } from "@/harness/tools/registry";
import {
  formFillTool,
  govLookupTool,
  rtiDraftTool,
  schemeLookupTool,
} from "@/harness/tools/builtin/sarkari";
import type { AppSettings, ToolDefinition, ToolExecuteContext } from "@/harness/types";
import { findPortals, getPortal } from "@/sarkari/portals";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "sarkari-tools-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function context(workspaceDir: string): ToolExecuteContext {
  return {
    runId: "run_test",
    signal: new AbortController().signal,
    store: {} as ToolExecuteContext["store"],
    workspaceDir,
    shellAllowlist: [],
    toolTimeoutMs: 10_000,
  };
}

async function run(tool: ToolDefinition, args: Record<string, unknown>) {
  return tool.execute(args, context(dir));
}

function settings(overrides: Partial<AppSettings["permissions"]> = {}): AppSettings {
  return {
    ...DEFAULT_SETTINGS,
    permissions: { ...DEFAULT_SETTINGS.permissions, ...overrides },
    updatedAt: new Date().toISOString(),
  };
}

describe("portal index", () => {
  it("looks up and searches official portals", () => {
    expect(getPortal("uidai-aadhaar")?.url).toBe("https://uidai.gov.in");
    expect(findPortals("passport")[0].id).toBe("passport-seva");
    expect(findPortals("rti")[0].id).toBe("rti-online");
    expect(findPortals("zzzz-no-match")).toHaveLength(0);
  });
});

describe("gov_lookup", () => {
  it("returns official domains for a service query", async () => {
    const result = await run(govLookupTool, { query: "passport renewal" });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content);
    expect(payload.count).toBeGreaterThan(0);
    expect(payload.results[0].url).toMatch(/^https:\/\//);
    expect(payload.results.map((entry: { url: string }) => entry.url)).toContain(
      "https://www.passportindia.gov.in",
    );
    expect(payload.guidance).toMatch(/official URL/i);
  });

  it("supports Hindi descriptions", async () => {
    const result = await run(govLookupTool, { query: "आधार", language: "hi" });
    const payload = JSON.parse(result.content);
    expect(payload.results[0].id).toBe("uidai-aadhaar");
    expect(payload.results[0].description).toMatch(/[\u0900-\u097F]/);
  });

  it("points to the national portal when nothing matches", async () => {
    const result = await run(govLookupTool, { query: "zzzz-no-match" });
    const payload = JSON.parse(result.content);
    expect(payload.count).toBe(0);
    expect(payload.results).toHaveLength(0);
    expect(payload.guidance).toContain("https://www.india.gov.in");
  });
});

describe("scheme_lookup", () => {
  it("looks up a scheme by exact id", async () => {
    const result = await run(schemeLookupTool, { id: "pm-kisan" });
    expect(result.isError).toBeFalsy();
    expect(result.content).toContain("₹6,000");
    expect(result.content).toContain("https://pmkisan.gov.in");
    expect(result.data?.ids).toEqual(["pm-kisan"]);
  });

  it("searches by free text", async () => {
    const result = await run(schemeLookupTool, { query: "farmer income" });
    expect(result.content).toContain("PM-KISAN");
    expect((result.data?.ids as string[] | undefined)?.[0]).toBe("pm-kisan");
  });

  it("uses Hindi section labels when asked", async () => {
    const result = await run(schemeLookupTool, { query: "health", language: "hi" });
    expect(result.content).toContain("पात्रता");
    expect(result.content).toContain("आधिकारिक लिंक");
  });

  it("reports an unknown id and a missing query", async () => {
    await expect(run(schemeLookupTool, { id: "not-a-scheme" })).resolves.toMatchObject({
      isError: true,
    });
    await expect(run(schemeLookupTool, {})).resolves.toMatchObject({ isError: true });
  });
});

describe("rti_draft", () => {
  it("writes a draft inside the workspace sandbox", async () => {
    const result = await run(rtiDraftTool, {
      applicantName: "Rahul Sharma",
      department: "Department of Food and Public Distribution",
      information: ["Copy of ration card records", "Reason for rejection of application"],
      address: "12 Janpath, New Delhi",
      phone: "9876543210",
      fileName: "My RTI",
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content);
    expect(payload.written).toBe(true);
    expect(payload.path).toMatch(/^rti[\\/]my-rti\.txt$/);
    expect(payload.items).toBe(2);

    const draft = await readFile(path.join(dir, payload.path), "utf8");
    expect(draft).toContain("Rahul Sharma");
    expect(draft).toContain("Department of Food and Public Distribution");
    expect(draft).toContain("Copy of ration card records");
    expect(draft).toContain("Reason for rejection of application");
  });

  it("rejects an empty information list", async () => {
    const result = await run(rtiDraftTool, {
      applicantName: "Rahul Sharma",
      department: "Department of Food",
      information: [],
    });
    expect(result.isError).toBe(true);
    expect(result.content).toMatch(/at least one/i);
  });
});

describe("form_fill", () => {
  it("generates a valid demo PDF in the workspace", async () => {
    const result = await run(formFillTool, {
      fullName: "Rahul Sharma",
      purpose: "PM-KISAN application",
      aadhaar: "999941057058",
      phone: "9876543210",
      address: "12 Janpath, New Delhi",
      state: "Delhi",
      fileName: "demo",
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content);
    expect(payload.written).toBe(true);
    expect(payload.template).toBe("demo-application");
    expect(payload.path).toMatch(/^forms[\\/]demo\.pdf$/);
    expect(payload.fields).toBeGreaterThanOrEqual(3);

    const bytes = await readFile(path.join(dir, payload.path));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("replaces non-Latin text instead of crashing the PDF writer", async () => {
    const result = await run(formFillTool, {
      fullName: "राहुल शर्मा",
      purpose: "आवेदन",
      fileName: "hindi",
    });

    const payload = JSON.parse(result.content);
    expect(payload.nonLatinReplaced).toBe(true);

    const bytes = await readFile(path.join(dir, payload.path));
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("sarkari tool registration", () => {
  it("marks only the local writers as vault users", () => {
    const infos = createToolRegistry({ enableShell: false }).infos(
      settings({ allowFileWrite: true }),
    );
    const byName = new Map(infos.map((info) => [info.name, info]));

    expect(byName.get("rti_draft")).toMatchObject({
      usesVault: true,
      sensitivity: "sensitive",
      enabled: true,
    });
    expect(byName.get("form_fill")).toMatchObject({
      usesVault: true,
      sensitivity: "sensitive",
      enabled: true,
    });
    expect(byName.get("gov_lookup")?.usesVault).toBeUndefined();
    expect(byName.get("scheme_lookup")?.usesVault).toBeUndefined();
    expect(byName.get("gov_lookup")?.enabled).toBe(true);
    expect(byName.get("scheme_lookup")?.enabled).toBe(true);
  });

  it("gates the local writers behind the file-write permission", () => {
    const infos = createToolRegistry({ enableShell: false }).infos(settings());
    const byName = new Map(infos.map((info) => [info.name, info]));

    expect(byName.get("rti_draft")?.enabled).toBe(false);
    expect(byName.get("rti_draft")?.disabledReason).toMatch(/allowFileWrite/);
    expect(byName.get("form_fill")?.enabled).toBe(false);
  });
});
