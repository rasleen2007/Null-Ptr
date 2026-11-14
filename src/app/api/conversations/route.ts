import { getHarness } from "@/harness";
import { HarnessError } from "@/harness/errors";
import { jsonError, jsonOk, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const harness = await getHarness();
    const q = new URL(req.url).searchParams.get("q")?.trim();
    const conversations = q
      ? await harness.store.searchConversations(q)
      : await harness.store.listConversations();
    return jsonOk({ conversations });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const harness = await getHarness();
    const settings = await harness.getSettings();
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : "New conversation";
    const model =
      typeof body.model === "string" && body.model.includes(":")
        ? body.model
        : settings.defaultModel;
    if (!model.includes(":")) {
      throw new HarnessError("Invalid model id. Expected \"<provider>:<model>\".", {
        status: 400,
        code: "invalid_model",
      });
    }
    const conversation = await harness.store.createConversation({
      title,
      model,
      systemPrompt:
        typeof body.systemPrompt === "string" ? body.systemPrompt.slice(0, 20_000) : undefined,
    });
    return jsonOk({ conversation }, 201);
  } catch (error) {
    return jsonError(error);
  }
}
