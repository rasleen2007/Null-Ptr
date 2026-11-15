import { getHarness } from "@/harness";
import { isAccessTokenRequired } from "@/lib/access";
import { envValue } from "@/lib/env";
import { jsonError, jsonOk } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const harness = await getHarness();
    const config = harness.config;
    return jsonOk({
      ok: true,
      version: "0.1.0",
      storage: harness.store.kind,
      providers: {
        gemini: Boolean(config.geminiApiKey),
        groq: Boolean(config.groqApiKey),
        openrouter: Boolean(config.openRouterApiKey),
        ollama: { endpoint: config.ollamaBaseUrl },
      },
      safety: {
        shellEnabled: config.enableShell,
        shellAllowlist: config.shellAllowlist,
        workspaceDir: config.workspaceDir,
        sensitiveToolsRequireApproval: true,
      },
      limits: {
        maxIterations: config.maxIterations,
        providerTimeoutMs: config.providerTimeoutMs,
        toolTimeoutMs: config.toolTimeoutMs,
        contextTokenBudget: config.contextTokenBudget,
      },
      authRequired: isAccessTokenRequired(),
      auth: {
        required: isAccessTokenRequired(),
        rateLimitPerMinute: Number(envValue("SAATHI_RATE_LIMIT_MAX", "JARVIS_RATE_LIMIT_MAX") ?? "240"),
        chatRateLimitPerMinute: Number(
          envValue("SAATHI_CHAT_RATE_LIMIT_MAX", "JARVIS_CHAT_RATE_LIMIT_MAX") ?? "60",
        ),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
