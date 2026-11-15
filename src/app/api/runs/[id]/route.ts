import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const run = await harness.getRun(id);
    if (!run) throw new HarnessError("Run not found.", { status: 404, code: "not_found" });
    return jsonOk({ run });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const run = await harness.getRun(id);
    if (!run) throw new HarnessError("Run not found.", { status: 404, code: "not_found" });
    await harness.store.deleteRun(id);
    return jsonOk({ deleted: true, id });
  } catch (error) {
    return jsonError(error);
  }
}
