import type { ToolDefinition } from "../../types";
import { stringArg } from "../args";
import { assertSafeUrl } from "../sandbox";

const MAX_BYTES = 200_000;
const MAX_REDIRECTS = 3;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description:
    "Fetch a public http(s) URL and return readable text. Private/loopback hosts are blocked. Responses are capped at 200 KB. Use for documentation or pages the user explicitly references.",
  parameters: {
    type: "object",
    properties: {
      url: { type: "string", description: "Public http or https URL to fetch." },
    },
    required: ["url"],
  },
  category: "web",
  sensitivity: "safe",
  async execute(args, ctx) {
    const rawUrl = stringArg(args, "url", { required: true, max: 2000 });
    let url = assertSafeUrl(rawUrl);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error("timeout")), 12_000);
    const onAbort = () => controller.abort(ctx.signal.reason);
    ctx.signal.addEventListener("abort", onAbort, { once: true });

    try {
      let response: Response | null = null;
      for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
        response = await fetch(url, {
          method: "GET",
          redirect: "manual",
          headers: {
            "User-Agent": "JARVIS-AI-Harness/0.1 (+local agent)",
            Accept: "text/html,application/json,text/plain,application/xml;q=0.9,*/*;q=0.5",
          },
          signal: controller.signal,
        });
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get("location");
          if (!location) break;
          url = assertSafeUrl(new URL(location, url).toString());
          continue;
        }
        break;
      }
      if (!response) throw new Error("No response received.");
      if (response.status >= 300 && response.status < 400) {
        return { content: "Too many redirects while fetching the URL.", isError: true };
      }
      if (!response.ok) {
        return {
          content: `Fetch failed with HTTP ${response.status} ${response.statusText}.`,
          isError: true,
        };
      }

      const contentType = response.headers.get("content-type") ?? "";
      const allowed =
        contentType.includes("text/") ||
        contentType.includes("application/json") ||
        contentType.includes("application/xml") ||
        contentType.includes("application/xhtml") ||
        contentType === "";
      if (!allowed) {
        return {
          content: `Unsupported content type "${contentType}". Only text, JSON, and XML are supported.`,
          isError: true,
        };
      }

      const declaredLength = Number(response.headers.get("content-length") ?? "0");
      if (declaredLength > MAX_BYTES) {
        return {
          content: `Response is too large (${declaredLength} bytes; limit ${MAX_BYTES}).`,
          isError: true,
        };
      }

      const buffer = await response.arrayBuffer();
      const slice = buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer;
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(slice);
      const text = contentType.includes("html") ? stripHtml(raw) : raw;
      return {
        content: JSON.stringify({
          url: url.toString(),
          status: response.status,
          contentType,
          truncated: buffer.byteLength > MAX_BYTES,
          text: text.slice(0, 20_000),
        }),
      };
    } catch (error) {
      return {
        content: `Web fetch error: ${(error as Error).message}`,
        isError: true,
        data: { url: url.toString() },
      };
    } finally {
      clearTimeout(timer);
      ctx.signal.removeEventListener("abort", onAbort);
    }
  },
};


