import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, readJson, streamResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const message = typeof body.message === "string" ? body.message : "";
    if (!message.trim()) {
      throw new HarnessError("Message is required.", { status: 400, code: "invalid_body" });
    }
    const harness = await getHarness();
    const source = await harness.startChat({
      message,
      conversationId: typeof body.conversationId === "string" ? body.conversationId : undefined,
      model: typeof body.model === "string" ? body.model : undefined,
      systemPrompt: typeof body.systemPrompt === "string" ? body.systemPrompt : undefined,
      temperature: typeof body.temperature === "number" ? body.temperature : undefined,
      kind: body.kind === "agent" ? "agent" : "chat",
      useTools: body.useTools !== false,
    });

    return streamResponse(source.events, () => {
      void harness.cancelRun(source.runId);
    });
  } catch (error) {
    return jsonError(error);
  }
}
