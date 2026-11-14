import { describe, expect, it } from "vitest";
import type { MemoryRecord } from "@/harness/types";
import {
  formatMemoryBlock,
  retrieveMemories,
  scoreMemory,
  tokenize,
} from "@/harness/memory/retrieval";

const now = new Date().toISOString();

function memory(overrides: Partial<MemoryRecord> & Pick<MemoryRecord, "content">): MemoryRecord {
  return {
    id: overrides.id ?? "mem_1",
    content: overrides.content,
    tags: overrides.tags ?? [],
    importance: overrides.importance ?? 0.5,
    accessCount: overrides.accessCount ?? 0,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    source: overrides.source,
  };
}

describe("tokenize", () => {
  it("lowercases, strips punctuation, and removes stopwords", () => {
    expect(tokenize("The user prefers CONCISE answers, please.")).toEqual([
      "prefers",
      "concise",
      "answers",
    ]);
  });

  it("drops short tokens", () => {
    expect(tokenize("a ab abc abcd")).toEqual(["abc", "abcd"]);
  });

  it("keeps Devanagari words and matras", () => {
    expect(tokenize("मेरा आधार नंबर याद रखें।")).toEqual([
      "आधार",
      "नंबर",
      "याद",
      "रखें",
    ]);
  });

  it("drops common Hindi and Hinglish function words", () => {
    expect(tokenize("Mera gaon Bihar mein hai")).toEqual(["gaon", "bihar"]);
    expect(tokenize("मेरा गाँव बिहार में है")).toEqual(["गाँव", "बिहार"]);
  });
});

describe("scoreMemory", () => {
  it("returns zero for unrelated memories", () => {
    const record = memory({ content: "Favorite color is teal", importance: 1 });
    expect(scoreMemory("quantum chromodynamics", record)).toBe(0);
  });

  it("weights tag matches above content matches", () => {
    const tagMatch = memory({ id: "tag", content: "Something unrelated", tags: ["typescript"] });
    const contentMatch = memory({ id: "content", content: "I like typescript sometimes" });
    expect(scoreMemory("typescript", tagMatch)).toBeGreaterThan(
      scoreMemory("typescript", contentMatch),
    );
  });

  it("adds importance to relevant matches", () => {
    const low = memory({ id: "low", content: "Deploys happen on friday", importance: 0 });
    const high = memory({ id: "high", content: "Deploys happen on friday", importance: 1 });
    expect(scoreMemory("deploys friday", high)).toBeGreaterThan(scoreMemory("deploys friday", low));
  });
});

describe("retrieveMemories", () => {
  it("sorts by score, filters irrelevant entries, and respects limit", () => {
    const memories = [
      memory({ id: "a", content: "The project deadline is March 14", importance: 0.9 }),
      memory({ id: "b", content: "Project codename is Nova", importance: 0.4 }),
      memory({ id: "c", content: "I enjoy hiking", importance: 1 }),
    ];
    const results = retrieveMemories("project deadline", memories, 2);
    expect(results).toHaveLength(2);
    expect(results[0].memory.id).toBe("a");
    expect(results.every((entry) => entry.score > 0)).toBe(true);
  });

  it("returns no results for an unrelated query", () => {
    const memories = [memory({ content: "The project deadline is March 14" })];
    expect(retrieveMemories("volcanic geology", memories, 5)).toHaveLength(0);
  });

  it("recalls Hindi memories with Devanagari queries", () => {
    const memories = [
      memory({ id: "hindi", content: "मेरा आधार कार्ड नंबर 9999 है", tags: ["aadhaar"] }),
      memory({ id: "other", content: "I enjoy hiking" }),
    ];
    const results = retrieveMemories("आधार नंबर", memories, 5);
    expect(results).toHaveLength(1);
    expect(results[0].memory.id).toBe("hindi");
  });

  it("recalls Hinglish memories with Hinglish queries", () => {
    const memories = [
      memory({ id: "bihar", content: "Mera gaon Bihar mein hai", tags: ["address"] }),
      memory({ id: "other", content: "I enjoy hiking" }),
    ];
    const results = retrieveMemories("Bihar gaon", memories, 5);
    expect(results[0].memory.id).toBe("bihar");
  });
});

describe("formatMemoryBlock", () => {
  it("returns an empty string when nothing was retrieved", () => {
    expect(formatMemoryBlock([])).toBe("");
  });

  it("includes ids, tags, and relevance scores", () => {
    const block = formatMemoryBlock([
      { memory: memory({ id: "mem_42", content: "Prefers dark mode", tags: ["prefs"] }), score: 0.88, matchedTerms: ["dark", "mode"] },
    ]);
    expect(block).toContain("mem_42");
    expect(block).toContain("prefs");
    expect(block).toContain("0.88");
    expect(block).toContain("Prefers dark mode");
    expect(block).toContain("matched: dark, mode");
  });

  it("truncates oversized memory blocks", () => {
    const block = formatMemoryBlock(
      [
        {
          memory: memory({ id: "long", content: "x".repeat(5000) }),
          score: 1,
          matchedTerms: [],
        },
      ],
      500,
    );
    expect(block).toContain("truncated");
    expect(block.length).toBeLessThan(700);
  });
});
