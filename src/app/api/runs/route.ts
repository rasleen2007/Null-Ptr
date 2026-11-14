import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const runs = await harness.store.listRuns(50);
    return jsonOk({ runs });
  } catch (error) {
    return jsonError(error);
  }
}
