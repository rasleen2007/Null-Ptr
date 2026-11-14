import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, readJson, streamResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson(req);
    if (typeof body.approved !== "boolean") {
      throw new HarnessError("Body must include a boolean \"approved\" field.", {
        status: 400,
        code: "invalid_body",
      });
    }
    const harness = await getHarness();
    const source = await harness.resumeRun(id, {
      approved: body.approved,
      note: typeof body.note === "string" ? body.note : undefined,
      toolCallId: typeof body.toolCallId === "string" ? body.toolCallId : undefined,
    });
    return streamResponse(source.events, () => {
      void harness.cancelRun(source.runId);
    });
  } catch (error) {
    return jsonError(error);
  }
}
