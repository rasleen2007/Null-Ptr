import http from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeOllamaRequest {
  path: string;
  method: string;
  body: Record<string, unknown> | null;
}

export interface FakeOllama {
  url: string;
  requests: FakeOllamaRequest[];
  chatRequests: () => FakeOllamaRequest[];
  reset: () => void;
  close: () => Promise<void>;
}

function writeLine(res: http.ServerResponse, payload: unknown): void {
  res.write(`${JSON.stringify(payload)}\n`);
}

function messageContent(chunk: { role?: string; content?: string; tool_calls?: unknown[] }) {
  return {
    model: "fake",
    created_at: new Date().toISOString(),
    message: chunk,
    done: false,
  };
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

export async function startFakeOllama(): Promise<FakeOllama> {
  const requests: FakeOllamaRequest[] = [];
  const timers = new Set<NodeJS.Timeout>();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const body = req.method === "POST" ? await readBody(req) : null;
    requests.push({ path: url.pathname, method: req.method ?? "GET", body });

    if (req.method === "GET" && url.pathname === "/api/tags") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          models: [
            { name: "fake-chat", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-tool", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-error", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-slow", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-timeout", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-empty", size: 1, details: { parameter_size: "1B", family: "fake" } },
            { name: "fake-vault-tool", size: 1, details: { parameter_size: "1B", family: "fake" } },
          ],
        }),
      );
      return;
    }

    if (req.method !== "POST" || url.pathname !== "/api/chat") {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    const model = String(body?.model ?? "");
    const messages = Array.isArray(body?.messages)
      ? (body.messages as { role?: string; content?: string; tool_name?: string }[])
      : [];
    const toolResults = messages.filter((message) => message.role === "tool");
    const hasToolResult = toolResults.length > 0;
    const toolDenied = toolResults.some((message) => /denied/i.test(message.content ?? ""));

    if (model === "fake-error") {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "fake provider explosion" }));
      return;
    }

    res.writeHead(200, { "Content-Type": "application/x-ndjson" });

    if (model === "fake-tool") {
      if (!hasToolResult) {
        writeLine(res, {
          model,
          message: {
            role: "assistant",
            content: "I need to write a file. Requesting permission.",
            tool_calls: [
              {
                function: {
                  name: "file_write",
                  arguments: { path: "notes/approval.txt", content: "approved by test" },
                },
              },
            ],
          },
          done: true,
          done_reason: "tool_calls",
        });
      } else if (toolDenied) {
        writeLine(res, messageContent({ role: "assistant", content: "The write was denied. " }));
        writeLine(res, messageContent({ role: "assistant", content: "Nothing was executed." }));
        writeLine(res, {
          model,
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
        });
      } else {
        writeLine(res, messageContent({ role: "assistant", content: "The write was " }));
        writeLine(res, messageContent({ role: "assistant", content: "approved and completed." }));
        writeLine(res, {
          model,
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 12,
          eval_count: 6,
        });
      }
      res.end();
      return;
    }

    if (model === "fake-vault-tool") {
      if (!hasToolResult) {
        writeLine(res, {
          model,
          message: {
            role: "assistant",
            content: "I need the vault-backed RTI tool. Requesting permission.",
            tool_calls: [
              {
                function: {
                  name: "rti_draft",
                  arguments: {
                    language: "en",
                    applicantName: "{{NAME_1}}",
                    department: "Department of Food and Public Distribution",
                    information: ["Copy of records linked to Aadhaar {{AADHAAR_1}}"],
                    fileName: "vault-test",
                  },
                },
              },
            ],
          },
          done: true,
          done_reason: "tool_calls",
        });
      } else if (toolDenied) {
        writeLine(res, messageContent({ role: "assistant", content: "The draft was denied. " }));
        writeLine(res, messageContent({ role: "assistant", content: "Nothing was executed." }));
        writeLine(res, {
          model,
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
        });
      } else {
        writeLine(res, messageContent({ role: "assistant", content: "The RTI draft " }));
        writeLine(res, messageContent({ role: "assistant", content: "was written." }));
        writeLine(res, {
          model,
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 15,
          eval_count: 6,
        });
      }
      res.end();
      return;
    }

    if (model === "fake-slow") {
      writeLine(res, messageContent({ role: "assistant", content: "partial response " }));
      let closed = false;
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (closed) return;
        writeLine(res, messageContent({ role: "assistant", content: "too late" }));
        writeLine(res, {
          model,
          message: { role: "assistant", content: "" },
          done: true,
          done_reason: "stop",
        });
        res.end();
      }, 10_000);
      timers.add(timer);
      req.on("close", () => {
        closed = true;
        clearTimeout(timer);
        timers.delete(timer);
      });
      return;
    }

    if (model === "fake-timeout") {
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

    if (model === "fake-empty") {
      writeLine(res, {
        model,
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "stop",
      });
      res.end();
      return;
    }

    writeLine(res, messageContent({ role: "assistant", content: "Hello " }));
    writeLine(res, messageContent({ role: "assistant", content: "from fake Ollama." }));
    writeLine(res, {
      model: model || "fake-chat",
      message: { role: "assistant", content: "" },
      done: true,
      done_reason: "stop",
      prompt_eval_count: 9,
      eval_count: 4,
    });
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    chatRequests: () => requests.filter((request) => request.path === "/api/chat"),
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
