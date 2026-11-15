import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const runs = await harness.store.listRuns(50);
    // Enrich each run with the tool names seen in its execution logs so the
    // activity table can show a summary without a second round trip per run.
    const logs = await harness.store.listLogs({ limit: 2000 });
    const toolsByRun = new Map<string, string[]>();
    for (const log of logs) {
      if (!log.runId || log.event !== "tool_result") continue;
      const tool = typeof log.data?.tool === "string" ? log.data.tool : undefined;
      if (!tool) continue;
      const list = toolsByRun.get(log.runId) ?? [];
      if (!list.includes(tool)) list.push(tool);
      toolsByRun.set(log.runId, list);
    }
    return jsonOk({
      runs: runs.map((run) => ({ ...run, toolsUsed: toolsByRun.get(run.id) ?? [] })),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE() {
  try {
    const harness = await getHarness();
    await harness.store.clearRuns();
    await harness.store.clearLogs();
    return jsonOk({ cleared: true });
  } catch (error) {
    return jsonError(error);
  }
}
