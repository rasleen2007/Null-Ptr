import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { retrieveMemories } from "@/harness/memory/retrieval";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const harness = await getHarness();
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim() ?? "";
    const limitParam = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 200;
    const memories = await harness.store.listMemories(500);
    if (!q) return jsonOk({ memories: memories.slice(0, limit) });
    const results = retrieveMemories(q, memories, limit).map(({ memory, score }) => ({
      ...memory,
      score,
    }));
    return jsonOk({ memories: results });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (content.length < 3) {
      throw new HarnessError("Memory content must be at least 3 characters.", {
        status: 400,
        code: "invalid_body",
      });
    }
    if (content.length > 5000) {
      throw new HarnessError("Memory content is too long (max 5000 characters).", {
        status: 400,
        code: "invalid_body",
      });
    }
    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim().slice(0, 32))
          .filter(Boolean)
          .slice(0, 12)
      : [];
    const importance =
      typeof body.importance === "number" && Number.isFinite(body.importance)
        ? Math.max(0, Math.min(1, body.importance))
        : 0.6;
    const harness = await getHarness();
    const memory = await harness.store.createMemory({
      content,
      tags,
      importance,
      source: "user",
    });
    return jsonOk({ memory }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
