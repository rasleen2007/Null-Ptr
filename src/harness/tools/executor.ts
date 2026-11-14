import type { ToolDefinition, ToolExecutionResult } from "../types";
import { toErrorMessage } from "../errors";
import { truncate } from "../utils";

const MAX_RESULT_CHARS = 24_000;

export async function executeToolWithTimeout(
  tool: ToolDefinition,
  args: Record<string, unknown>,
  context: Parameters<ToolDefinition["execute"]>[1],
  timeoutMs: number,
): Promise<ToolExecutionResult> {
  let timer: NodeJS.Timeout | undefined;
  try {
    const result = await Promise.race([
      tool.execute(args, context),
      new Promise<ToolExecutionResult>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              content: `Tool "${tool.name}" timed out after ${timeoutMs}ms.`,
              isError: true,
            }),
          timeoutMs,
        );
      }),
    ]);
    return {
      ...result,
      content: truncate(result.content ?? "", MAX_RESULT_CHARS),
    };
  } catch (error) {
    return {
      content: `Tool "${tool.name}" failed: ${toErrorMessage(error)}`,
      isError: true,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
