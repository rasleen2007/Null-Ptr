import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const body = await readJson(req);
    const harness = await getHarness();
    const patch: Record<string, unknown> = {};
    if (typeof body.content === "string") {
      const content = body.content.trim();
      if (content.length < 3) {
        throw new HarnessError("Memory content must be at least 3 characters.", {
          status: 400,
          code: "invalid_body",
        });
      }
      patch.content = content.slice(0, 5000);
    }
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim().slice(0, 32))
        .filter(Boolean)
        .slice(0, 12);
    }
    if (typeof body.importance === "number" && Number.isFinite(body.importance)) {
      patch.importance = Math.max(0, Math.min(1, body.importance));
    }
    if (!Object.keys(patch).length) {
      throw new HarnessError("No valid fields to update.", { status: 400, code: "invalid_body" });
    }
    const memory = await harness.store.updateMemory(id, patch);
    if (!memory) throw new HarnessError("Memory not found.", { status: 404, code: "not_found" });
    return jsonOk({ memory });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    await harness.store.deleteMemory(id);
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
