import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const [models, providers, settings] = await Promise.all([
      harness.listModels(),
      harness.providerStatuses(),
      harness.getSettings(),
    ]);
    return jsonOk({ models, providers, defaultModel: settings.defaultModel });
  } catch (error) {
    return jsonError(error);
  }
}
