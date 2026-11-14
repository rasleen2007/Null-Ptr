import { describe, expect, it } from "vitest";
import {
  buildSarkariSystemPrompt,
  composeSarkariPrompt,
  SARKARI_SYSTEM_PROMPT,
} from "@/sarkari/persona";
import { DEFAULT_SYSTEM_PROMPT } from "@/harness/config";

describe("Sarkari persona prompt composition", () => {
  it("builds the default Sarkari prompt with optional context", () => {
    const promptWithoutContext = buildSarkariSystemPrompt();
    expect(promptWithoutContext).toBe(SARKARI_SYSTEM_PROMPT);
    expect(promptWithoutContext).toContain("You are Sarkari");

    const promptWithContext = buildSarkariSystemPrompt({
      context: "Today is 2026-11-14. The personal vault is unlocked.",
    });
    expect(promptWithContext).toContain("You are Sarkari");
    expect(promptWithContext).toContain("Current context:\nToday is 2026-11-14. The personal vault is unlocked.");
  });

  it("composes with empty or undefined base prompt without duplication", () => {
    const composed = composeSarkariPrompt(undefined, { context: "Vault is locked." });
    expect(composed).toContain("You are Sarkari");
    expect(composed).toContain("Vault is locked.");
    expect(composed.match(/You are Sarkari/g)).toHaveLength(1);
  });

  it("preserves user-configured operating rules under additional rules", () => {
    const userRules = "Always format financial amounts in INR and use bullet points.";
    const composed = composeSarkariPrompt(userRules, { context: "Vault is unlocked." });

    expect(composed).toContain("You are Sarkari");
    expect(composed).toContain("Additional operating rules configured by the user:");
    expect(composed).toContain(userRules);
    // Does not overwrite or alter the constant
    expect(DEFAULT_SYSTEM_PROMPT).not.toContain("You are Sarkari");
  });

  it("avoids duplicating the Sarkari instructions if base prompt already has them", () => {
    const existingSarkari = composeSarkariPrompt(undefined, { context: "Context 1" });
    const reComposed = composeSarkariPrompt(existingSarkari, { context: "Context 2 (updated)" });

    expect(reComposed.match(/You are Sarkari/g)).toHaveLength(1);
    expect(reComposed).toContain("Context 2 (updated)");
    expect(reComposed).not.toContain("Context 1");
    expect(reComposed.match(/Current context:/g)).toHaveLength(1);
  });

  it("updates existing context cleanly when called repeatedly", () => {
    let prompt = composeSarkariPrompt("Be concise", { context: "Day 1: Vault locked" });
    expect(prompt).toContain("Day 1: Vault locked");

    prompt = composeSarkariPrompt(prompt, { context: "Day 2: Vault unlocked" });
    expect(prompt).toContain("Day 2: Vault unlocked");
    expect(prompt).not.toContain("Day 1: Vault locked");
    expect(prompt.match(/Current context:/g)).toHaveLength(1);
    expect(prompt).toContain("Additional operating rules configured by the user:\nBe concise");
  });
});
