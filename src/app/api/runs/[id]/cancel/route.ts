import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const cancelled = await harness.cancelRun(id);
    if (!cancelled) {
      return jsonOk({ cancelled: false, message: "Run was not active or already finished." }, 409);
    }
    return jsonOk({ cancelled: true });
  } catch (error) {
    return jsonError(error);
  }
}
