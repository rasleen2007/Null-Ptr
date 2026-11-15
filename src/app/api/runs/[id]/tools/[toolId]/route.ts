import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; toolId: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    const { id, toolId } = await context.params;
    const harness = await getHarness();
    const logs = await harness.store.listLogs({ runId: id, limit: 500 });
    const log = logs.find((entry) => entry.id === toolId);
    if (!log) throw new HarnessError("Tool execution not found.", { status: 404, code: "not_found" });
    return jsonOk({ execution: log });
  } catch (error) {
    return jsonError(error);
  }
}
