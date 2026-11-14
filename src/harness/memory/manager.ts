import type { MemoryRecord, RetrievedMemory } from "../types";
import type { Storage } from "../storage/types";
import { formatMemoryBlock, retrieveMemories } from "./retrieval";

export interface RetrievedMemoryContext {
  memories: RetrievedMemory[];
  promptBlock: string;
}

export async function retrieveMemoryContext(
  store: Storage,
  query: string,
  limit: number,
  touch = true,
): Promise<RetrievedMemoryContext> {
  const all = await store.listMemories(300);
  const retrieved = retrieveMemories(query, all, limit);
  if (!retrieved.length) return { memories: [], promptBlock: "" };

  if (touch) {
    const now = new Date().toISOString();
    await Promise.all(
      retrieved.map(({ memory }) =>
        store
          .updateMemory(memory.id, {
            accessCount: memory.accessCount + 1,
            lastAccessedAt: now,
          })
          .catch(() => null),
      ),
    );
  }

  return {
    memories: retrieved,
    promptBlock: formatMemoryBlock(retrieved),
  };
}
