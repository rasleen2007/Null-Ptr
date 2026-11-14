import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const [tools, settings] = await Promise.all([harness.toolInfos(), harness.getSettings()]);
    return jsonOk({ tools, permissions: settings.permissions });
  } catch (error) {
    return jsonError(error);
  }
}
