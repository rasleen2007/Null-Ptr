import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeOpenAiRequest {
  path: string;
  method: string;
  headers: http.IncomingHttpHeaders;
  body: Record<string, unknown> | null;
}

export interface FakeOpenAi {
  url: string;
  requests: FakeOpenAiRequest[];
  reset: () => void;
  close: () => Promise<void>;
}

function sse(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function readBody(req: http.IncomingMessage): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => resolve(null));
  });
}

export async function startFakeOpenAi(options: { validKey?: string } = {}): Promise<FakeOpenAi> {
  const requests: FakeOpenAiRequest[] = [];
  const timers = new Set<NodeJS.Timeout>();
  const validKey = options.validKey ?? "test-key";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = req.method === "POST" ? await readBody(req) : null;
    requests.push({
      path: url.pathname,
      method: req.method ?? "GET",
      headers: req.headers,
      body,
    });

    if (req.method !== "POST" || url.pathname !== "/chat/completions") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    const auth = req.headers.authorization ?? "";
    if (auth !== `Bearer ${validKey}`) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid api key" } }));
      return;
    }

    const model = String(body?.model ?? "");
    if (model === "error-500") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "fake upstream failure" } }));
      return;
    }
    if (model === "rate-limit") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "rate limited" } }));
      return;
    }
    if (model === "slow-timeout") {
      const timer = setTimeout(() => {
        timers.delete(timer);
        res.end();
      }, 10_000);
      timers.add(timer);
      req.on("close", () => {
        clearTimeout(timer);
        timers.delete(timer);
      });
      return;
    }

    res.writeHead(200, { "Content-Type": "text/event-stream" });
    if (model === "tool-model") {
      res.write(
        sse({
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_fake_1",
                    type: "function",
                    function: {
                      name: "calculator",
                      arguments: '{"expression":"2+2"}',
                    },
                  },
                ],
              },
            },
          ],
        }),
      );
      res.write(sse({ choices: [{ delta: {}, finish_reason: "tool_calls" }] }));
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.write(
      sse({
        choices: [{ delta: { content: "Hello " }, finish_reason: null }],
      }),
    );
    res.write(
      sse({
        choices: [{ delta: { content: "from OpenAI-compatible." }, finish_reason: null }],
      }),
    );
    res.write(
      sse({
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 7, completion_tokens: 5 },
      }),
    );
    res.write("data: [DONE]\n\n");
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    reset: () => {
      requests.length = 0;
    },
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
