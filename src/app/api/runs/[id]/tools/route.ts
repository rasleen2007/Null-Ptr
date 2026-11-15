import { getHarness } from "@/harness";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

interface ToolExecution {
  id: string;
  runId: string;
  name: string;
  status: "completed" | "failed";
  startedAt: string;
  completedAt: string;
  output?: unknown;
  error?: string;
  requiresApproval: boolean;
}

export async function GET(_req: Request, context: Params) {
  try {
    const { id } = await context.params;
    const harness = await getHarness();
    const logs = await harness.store.listLogs({ runId: id, limit: 500 });
    const executions: ToolExecution[] = logs
      .filter((log) => log.event === "tool_result")
      .map((log) => {
        const tool = typeof log.data?.tool === "string" ? log.data.tool : "unknown_tool";
        const isError = Boolean(log.data?.isError);
        return {
          id: log.id,
          runId: id,
          name: tool,
          status: isError ? ("failed" as const) : ("completed" as const),
          startedAt: log.createdAt,
          completedAt: log.createdAt,
          output: log.message,
          error: isError ? log.message : undefined,
          requiresApproval: false,
        };
      })
      .reverse();
    return jsonOk({ executions });
  } catch (error) {
    return jsonError(error);
  }
}
