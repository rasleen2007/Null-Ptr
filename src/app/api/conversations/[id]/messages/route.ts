import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const messages = await harness.store.listMessages(id);
    return jsonOk({ messages });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    await harness.store.clearMessages(id);
    return jsonOk({ cleared: true });
  } catch (error) {
    return jsonError(error);
  }
}
