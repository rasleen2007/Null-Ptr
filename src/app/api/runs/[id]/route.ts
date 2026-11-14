import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
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
