import { getHarness } from "@/harness";
import type { LogLevel } from "@/harness/types";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEVELS = new Set(["debug", "info", "warn", "error"]);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get("runId") ?? undefined;
    const conversationId = url.searchParams.get("conversationId") ?? undefined;
    const rawLevel = url.searchParams.get("level");
    const level =
      rawLevel && LEVELS.has(rawLevel) ? (rawLevel as LogLevel) : undefined;
    const limitParam = Number(url.searchParams.get("limit") ?? "200");
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(500, limitParam)) : 200;
    const harness = await getHarness();
    const logs = await harness.store.listLogs({ runId, conversationId, level, limit });
    return jsonOk({ logs });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const harness = await getHarness();
    await harness.store.clearLogs();
    return jsonOk({ cleared: true });
  } catch (error) {
    return jsonError(error);
  }
}
