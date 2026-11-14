import { describe, expect, it } from "vitest";
import { tokenize, retrieveMemories, scoreMemory, formatMemoryBlock, type MemoryRecord } from "@/harness/memory/retrieval";

const createMemory = (overrides: Partial<MemoryRecord> = {}): MemoryRecord => ({
  id: "mem_test",
  content: "",
  tags: [],
  importance: 0.6,
  accessCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

describe("tokenize", () => {
  it("tokenizes English text", () => {
    const tokens = tokenize("What is the PM-KISAN scheme about");
    expect(tokens).toContain("pm-kisan");
    expect(tokens).toContain("scheme");
    expect(tokens).not.toContain("what");
    expect(tokens).not.toContain("is");
    expect(tokens).not.toContain("the");
    expect(tokens).not.toContain("about");
  });

  it("tokenizes Devanagari text", () => {
    const tokens = tokenize("पीएम किसान योजना क्या है");
    expect(tokens).toContain("किसान");
    expect(tokens).toContain("योजना");
    expect(tokens).not.toContain("क्या");
    expect(tokens).not.toContain("है");
  });

  it("tokenizes Hinglish text", () => {
    const tokens = tokenize("mera aadhaar number kya hai");
    expect(tokens).toContain("aadhaar");
    expect(tokens).toContain("number");
    expect(tokens).not.toContain("mera");
    expect(tokens).not.toContain("kya");
    expect(tokens).not.toContain("hai");
  });

  it("tokenizes mixed Devanagari and English", () => {
    const tokens = tokenize("PM-KISAN योजना details");
    expect(tokens).toContain("pm-kisan");
    expect(tokens).toContain("योजना");
    expect(tokens).toContain("details");
  });

  it("handles punctuation and special characters", () => {
    const tokens = tokenize("Aadhaar: 999941057058, PAN: ABCDE1234F!");
    expect(tokens).toContain("aadhaar");
    expect(tokens).toContain("pan");
    // Numbers are kept as tokens
    expect(tokens).toContain("999941057058");
    expect(tokens).toContain("abcde1234f");
  });
});

describe("scoreMemory", () => {
  it("scores exact tag matches higher than content matches", () => {
    const memory = createMemory({
      content: "User prefers concise answers",
      tags: ["preferences"],
      importance: 0.8,
    });

    const tagMatchScore = scoreMemory(["preferences"], memory);
    const contentMatchScore = scoreMemory(["concise"], memory);

    expect(tagMatchScore).toBeGreaterThan(contentMatchScore);
  });

  it("scores Devanagari tag matches", () => {
    const memory = createMemory({
      content: "User likes short responses",
      tags: ["पसंद"],
      importance: 0.7,
    });

    const score = scoreMemory(["पसंद"], memory);
    expect(score).toBeGreaterThan(0);
  });

  it("scores Hinglish tag matches", () => {
    const memory = createMemory({
      content: "User wants brief answers",
      tags: ["pasand"],
      importance: 0.7,
    });

    const score = scoreMemory(["pasand"], memory);
    expect(score).toBeGreaterThan(0);
  });

  it("returns 0 for no overlap with zero importance and no recency", () => {
    const memory = createMemory({
      content: "Completely separate content about cooking",
      tags: ["other"],
      importance: 0,
      updatedAt: "2000-01-01T00:00:00.000Z",
    });

    expect(scoreMemory(["unrelated", "different"], memory)).toBe(0);
  });
});

describe("retrieveMemories with matchedTerms", () => {
  it("returns matchedTerms for English query", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "PM-KISAN provides ₹6000 per year to farmers",
        tags: ["schemes", "farmers"],
        importance: 0.8,
      }),
      createMemory({
        id: "mem_2",
        content: "Ayushman Bharat provides health insurance",
        tags: ["health", "insurance"],
        importance: 0.7,
      }),
    ];

    const results = retrieveMemories("PM-KISAN scheme benefits", memories, 5);

    expect(results).toHaveLength(1);
    expect(results[0].memory.id).toBe("mem_1");
    expect(results[0].matchedTerms).toContain("pm-kisan");
    // "scheme" is a stopword, so it won't be in matchedTerms
  });

  it("returns matchedTerms for Devanagari query", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "पीएम किसान योजना किसानों को ₹6000 देती है",
        tags: ["योजना", "किसान"],
        importance: 0.8,
      }),
      createMemory({
        id: "mem_2",
        content: "आयुष्मान भारत स्वास्थ्य बीमा देता है",
        tags: ["स्वास्थ्य", "बीमा"],
        importance: 0.7,
      }),
    ];

    const results = retrieveMemories("पीएम किसान योजना लाभ", memories, 5);

    expect(results).toHaveLength(1);
    expect(results[0].memory.id).toBe("mem_1");
    expect(results[0].matchedTerms).toContain("किसान");
    expect(results[0].matchedTerms).toContain("योजना");
  });

  it("returns matchedTerms for Hinglish query", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "PM-KISAN yojana kisan ko paisa deti hai",
        tags: ["yojana", "kisan"],
        importance: 0.8,
      }),
      createMemory({
        id: "mem_2",
        content: "Ayushman Bharat health insurance deta hai",
        tags: ["health", "insurance"],
        importance: 0.7,
      }),
    ];

    const results = retrieveMemories("PM-KISAN yojana kya hai", memories, 5);

    expect(results).toHaveLength(1);
    expect(results[0].memory.id).toBe("mem_1");
    expect(results[0].matchedTerms).toContain("pm-kisan");
    expect(results[0].matchedTerms).toContain("yojana");
  });

  it("returns matchedTerms for mixed Devanagari and English query", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "PM-KISAN योजना details here",
        tags: ["scheme", "योजना"],
        importance: 0.8,
      }),
    ];

    const results = retrieveMemories("PM-KISAN योजना", memories, 5);

    expect(results).toHaveLength(1);
    expect(results[0].matchedTerms).toContain("pm-kisan");
    expect(results[0].matchedTerms).toContain("योजना");
  });

  it("includes tag matches in matchedTerms", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "Some content about farming",
        tags: ["pm-kisan", "agriculture"],
        importance: 0.8,
      }),
    ];

    const results = retrieveMemories("pm-kisan benefits", memories, 5);

    expect(results).toHaveLength(1);
    expect(results[0].matchedTerms).toContain("pm-kisan");
  });

  it("returns empty matchedTerms when no tokens match", () => {
    const memories = [
      createMemory({
        id: "mem_1",
        content: "Unrelated content about cooking",
        tags: ["cooking"],
        importance: 0.5,
      }),
    ];

    const results = retrieveMemories("farming agriculture", memories, 5);

    expect(results).toHaveLength(0);
  });

  it("limits results to the specified limit", () => {
    const memories = Array.from({ length: 10 }, (_, i) =>
      createMemory({
        id: `mem_${i}`,
        content: `Memory ${i} about PM-KISAN scheme`,
        tags: ["pm-kisan"],
        importance: 0.5 + i * 0.05,
      })
    );

    const results = retrieveMemories("PM-KISAN", memories, 3);
    expect(results).toHaveLength(3);
  });

  it("sorts by score descending", () => {
    const memories = [
      createMemory({
        id: "mem_low",
        content: "PM-KISAN mentioned once",
        tags: [],
        importance: 0.3,
      }),
      createMemory({
        id: "mem_high",
        content: "PM-KISAN PM-KISAN PM-KISAN scheme benefits farmers",
        tags: ["pm-kisan", "scheme"],
        importance: 0.9,
      }),
    ];

    const results = retrieveMemories("PM-KISAN scheme", memories, 5);

    expect(results[0].memory.id).toBe("mem_high");
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });
});

describe("formatMemoryBlock", () => {
  it("includes matchedTerms in formatted output", () => {
    const retrieved = [
      {
        memory: createMemory({
          id: "mem_1",
          content: "PM-KISAN provides income support",
          tags: ["scheme"],
          importance: 0.8,
        }),
        score: 0.85,
        matchedTerms: ["pm-kisan", "scheme"],
      },
    ];

    const block = formatMemoryBlock(retrieved);
    expect(block).toContain("mem_1");
    expect(block).toContain("scheme");
    expect(block).toContain("PM-KISAN provides income support");
    expect(block).toContain("matched: pm-kisan, scheme");
  });

  it("omits matchedTerms when empty", () => {
    const retrieved = [
      {
        memory: createMemory({
          id: "mem_1",
          content: "Some content",
          tags: [],
          importance: 0.5,
        }),
        score: 0.4,
        matchedTerms: [],
      },
    ];

    const block = formatMemoryBlock(retrieved);
    expect(block).not.toContain("matched:");
  });
});