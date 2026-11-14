import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const conversation = await harness.store.getConversation(id);
    if (!conversation) throw new HarnessError("Conversation not found.", { status: 404, code: "not_found" });
    const messages = await harness.store.listMessages(id);
    return jsonOk({ conversation, messages });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const body = await readJson(req);
    const harness = await getHarness();
    const patch: Record<string, unknown> = {};
    if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim().slice(0, 200);
    if (typeof body.pinned === "boolean") patch.pinned = body.pinned;
    if (typeof body.model === "string" && body.model.includes(":")) patch.model = body.model;
    if (typeof body.systemPrompt === "string") patch.systemPrompt = body.systemPrompt.slice(0, 20_000);
    if (!Object.keys(patch).length) {
      throw new HarnessError("No valid fields to update.", { status: 400, code: "invalid_body" });
    }
    const conversation = await harness.store.updateConversation(id, patch);
    if (!conversation) throw new HarnessError("Conversation not found.", { status: 404, code: "not_found" });
    return jsonOk({ conversation });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const existing = await harness.store.getConversation(id);
    if (!existing) throw new HarnessError("Conversation not found.", { status: 404, code: "not_found" });
    await harness.store.deleteConversation(id);
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
