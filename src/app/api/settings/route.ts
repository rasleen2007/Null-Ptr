import { getHarness } from "@/harness";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const settings = await harness.getSettings();
    return jsonOk({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await readJson(req);
    const harness = await getHarness();
    const settings = await harness.updateSettings({
      defaultModel: typeof body.defaultModel === "string" ? body.defaultModel : undefined,
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      maxIterations: typeof body.maxIterations === "number" ? body.maxIterations : undefined,
      memoryEnabled: typeof body.memoryEnabled === "boolean" ? body.memoryEnabled : undefined,
      memoryLimit: typeof body.memoryLimit === "number" ? body.memoryLimit : undefined,
      toolsEnabled: typeof body.toolsEnabled === "boolean" ? body.toolsEnabled : undefined,
      streamResponses: typeof body.streamResponses === "boolean" ? body.streamResponses : undefined,
      permissions:
        body.permissions && typeof body.permissions === "object"
          ? (body.permissions as Partial<import("@/harness/types").ToolPermissionSettings>)
          : undefined,
    });
    return jsonOk({ settings });
  } catch (error) {
    return jsonError(error);
  }
}

