import type { ToolDefinition } from "../../types";
import { numberArg, stringArg, stringArrayArg } from "../args";
import { retrieveMemories } from "../../memory/retrieval";
import { redact } from "../../../sarkari/tokenizer";

export const memorySearchTool: ToolDefinition = {
  name: "memory_search",
  description:
    "Search the user's persistent long-term memory using lexical relevance. Use this before asking the user to repeat durable facts.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "Keywords describing what you are looking for." },
      limit: { type: "number", description: "Maximum results (1-20). Default 5." },
    },
    required: ["query"],
  },
  category: "memory",
  sensitivity: "safe",
  async execute(args, ctx) {
    const query = stringArg(args, "query", { required: true, max: 500 });
    const limit = numberArg(args, "limit", { min: 1, max: 20, fallback: 5 });
    const memories = await ctx.store.listMemories(300);
    const results = retrieveMemories(query, memories, limit);
    if (!results.length) {
      return { content: JSON.stringify({ query, results: [], note: "No matching memories found." }) };
    }
    return {
      content: JSON.stringify({
        query,
        results: results.map(({ memory, score }) => ({
          id: memory.id,
          content: memory.content,
          tags: memory.tags,
          importance: memory.importance,
          score: Number(score.toFixed(3)),
          updatedAt: memory.updatedAt,
        })),
      }),
    };
  },
};

export const memorySaveTool: ToolDefinition = {
  name: "memory_save",
  description:
    "Persist a durable fact about the user or project into long-term memory. Only save information that will be useful in future conversations. Never store secrets, API keys, or passwords.",
  parameters: {
    type: "object",
    properties: {
      content: { type: "string", description: "A concise, self-contained fact to remember." },
      tags: {
        type: "array",
        items: { type: "string" },
        description: "Optional short tags for retrieval, e.g. [\"preferences\", \"project\"].",
      },
      importance: {
        type: "number",
        description: "Importance from 0 to 1. Default 0.6.",
      },
    },
    required: ["content"],
  },
  category: "memory",
  sensitivity: "safe",
  async execute(args, ctx) {
    const content = stringArg(args, "content", { required: true, min: 3, max: 2000 });
    const sanitized = await redact(content);
    if (sanitized.report.locked) {
      return {
        content:
          "Cannot save memory containing personal identifiers while the personal vault is locked. Unlock the vault first.",
        isError: true,
      };
    }
    const safeContent = sanitized.text;
    const tags = stringArrayArg(args, "tags", { maxItems: 8, maxLength: 32 });
    const importance = numberArg(args, "importance", { min: 0, max: 1, fallback: 0.6 });
    const memory = await ctx.store.createMemory({
      content: safeContent,
      tags,
      importance,
      source: "agent",
    });
    return {
      content: JSON.stringify({ saved: true, id: memory.id, content: memory.content, tags: memory.tags }),
    };
  },
};

export const memoryUpdateTool: ToolDefinition = {
  name: "memory_update",
  description:
    "Update an existing long-term memory by id. Use after memory_search when a stored fact has changed.",
  parameters: {
    type: "object",
    properties: {
      id: { type: "string", description: "Memory id, e.g. mem_abc123." },
      content: { type: "string", description: "New memory content." },
      tags: { type: "array", items: { type: "string" }, description: "Replacement tags." },
      importance: { type: "number", description: "New importance from 0 to 1." },
    },
    required: ["id"],
  },
  category: "memory",
  sensitivity: "safe",
  async execute(args, ctx) {
    const id = stringArg(args, "id", { required: true, max: 64 });
    const patch: Record<string, unknown> = {};
    if (args.content !== undefined) {
      const rawContent = stringArg(args, "content", { min: 3, max: 2000 });
      const sanitized = await redact(rawContent);
      if (sanitized.report.locked) {
        return {
          content:
            "Cannot update memory with personal identifiers while the personal vault is locked. Unlock the vault first.",
          isError: true,
        };
      }
      patch.content = sanitized.text;
    }
    if (args.tags !== undefined) patch.tags = stringArrayArg(args, "tags", { maxItems: 8 });
    if (args.importance !== undefined) {
      patch.importance = numberArg(args, "importance", { min: 0, max: 1 });
    }
    if (!Object.keys(patch).length) {
      return { content: "Nothing to update. Provide content, tags, or importance.", isError: true };
    }
    const updated = await ctx.store.updateMemory(id, patch);
    if (!updated) return { content: `Memory ${id} not found.`, isError: true };
    return {
      content: JSON.stringify({
        updated: true,
        id: updated.id,
        content: updated.content,
        tags: updated.tags,
        importance: updated.importance,
      }),
    };
  },
};

export const memoryTools = [memorySearchTool, memorySaveTool, memoryUpdateTool];

