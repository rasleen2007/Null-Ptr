import type { MemoryRecord, RetrievedMemory } from "../types";

export type { MemoryRecord };

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "have", "has", "had", "was", "were",
  "are", "you", "your", "yours", "our", "ours", "they", "them", "their", "what", "when",
  "where", "which", "who", "whom", "why", "how", "does", "did", "doing", "can", "could",
  "should", "would", "will", "shall", "may", "might", "must", "not", "but", "about", "into",
  "than", "then", "there", "here", "also", "just", "very", "more", "most", "some", "any",
  "all", "each", "every", "user", "please", "jarvis", "remember", "memory",
  // Hinglish and Roman-Hindi function words
  "hai", "hain", "tha", "thi", "the", "hoga", "hogi", "kar", "karo", "karna", "karta",
  "karti", "kiya", "raha", "rahi", "rahe", "mera", "meri", "mere", "mujhe", "hum",
  "humara", "humari", "aap", "aapka", "aapki", "tum", "tumhara", "yeh", "ye", "woh",
  "voh", "kya", "kaise", "kaun", "kab", "kahan", "kyun", "kyu", "aur", "ya", "ek",
  "mein", "me", "par", "se", "ko", "ka", "ki", "ke", "bhi", "nahi", "nahin", "haan",
  // Devanagari function words
  "है", "हैं", "था", "थी", "थे", "हो", "होता", "होती", "कर", "करो", "करना", "किया",
  "रहा", "रही", "रहे", "मेरा", "मेरी", "मेरे", "मुझे", "हम", "हमारा", "हमारी",
  "आप", "आपका", "आपकी", "तुम", "तुम्हारा", "यह", "ये", "वह", "वो", "क्या", "कैसे",
  "कौन", "कब", "कहाँ", "कहां", "क्यों", "और", "या", "एक", "में", "पर", "से", "को",
  "का", "की", "के", "भी", "नहीं", "हाँ", "जरूर", "ज़रूर",
]);

export function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    // Keep Unicode letters, combining marks (Devanagari matras), digits, "_" and "-".
    .replace(/[^\p{L}\p{M}\p{N}\s_-]+/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function recencyBoost(updatedAt: string): number {
  const time = Date.parse(updatedAt);
  if (!Number.isFinite(time)) return 0;
  const days = Math.max(0, (Date.now() - time) / 86_400_000);
  return Math.max(0, 0.05 - (days / 365) * 0.05);
}

export function scoreMemory(query: string | string[], memory: MemoryRecord): number {
  const queryTokens = Array.isArray(query) ? query : tokenize(query);
  if (!queryTokens.length) {
    return Math.max(0, memory.importance) * 0.5 + recencyBoost(memory.updatedAt);
  }
  const contentTokens = new Set(tokenize(memory.content));
  const tagTokens = new Set(memory.tags.flatMap((tag) => tokenize(tag)));
  const uniqueQuery = new Set(queryTokens);

  let overlap = 0;
  for (const token of uniqueQuery) {
    if (tagTokens.has(token)) overlap += 1.5;
    else if (contentTokens.has(token)) overlap += 1;
  }
  if (overlap === 0) return 0;

  const relevance = overlap / Math.sqrt(uniqueQuery.size);
  const importance = Math.max(0, Math.min(1, memory.importance)) * 0.15;
  return relevance + importance + recencyBoost(memory.updatedAt);
}

function getMatchedTerms(queryTokens: string[], memory: MemoryRecord): string[] {
  const contentTokens = new Set(tokenize(memory.content));
  const tagTokens = new Set(memory.tags.flatMap((tag) => tokenize(tag)));
  const matched: string[] = [];

  for (const token of queryTokens) {
    if (tagTokens.has(token)) {
      matched.push(token);
    } else if (contentTokens.has(token)) {
      matched.push(token);
    }
  }
  return matched;
}

export function retrieveMemories(
  query: string,
  memories: MemoryRecord[],
  limit = 5,
  minScore = 0.01,
): RetrievedMemory[] {
  const queryTokens = tokenize(query);
  return memories
    .map((memory) => {
      const score = scoreMemory(queryTokens, memory);
      return { memory, score, matchedTerms: getMatchedTerms(queryTokens, memory) };
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, limit));
}

export function formatMemoryBlock(retrieved: RetrievedMemory[], maxChars = 2400): string {
  if (!retrieved.length) return "";
  const lines = retrieved.map(({ memory, score, matchedTerms }) => {
    const tags = memory.tags.length ? ` (tags: ${memory.tags.join(", ")})` : "";
    const matched = matchedTerms.length ? ` [matched: ${matchedTerms.join(", ")}]` : "";
    return `- [${memory.id}]${tags} ${memory.content} [relevance ${score.toFixed(2)}]${matched}`;
  });
  let block = `Retrieved long-term memories for this turn (lexical similarity, most relevant first):\n${lines.join("\n")}`;
  if (block.length > maxChars) block = `${block.slice(0, maxChars)}\n… [memory context truncated]`;
  return block;
}
