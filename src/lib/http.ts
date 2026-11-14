import { NextResponse } from "next/server";
import { HarnessError, toErrorMessage } from "@/harness/errors";
import { sseEncode } from "@/harness/utils";
import type { StreamEvent } from "@/harness/types";

export const MAX_JSON_BODY_BYTES = 1_000_000;

export function jsonOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function jsonError(error: unknown): NextResponse {
  if (error instanceof HarnessError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status, headers: { "Cache-Control": "no-store" } },
    );
  }
  console.error("[jarvis/api]", error);
  return NextResponse.json(
    { error: "Internal server error.", code: "internal_error" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const declaredLength = Number(req.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
      throw new HarnessError("Request body is too large.", {
        status: 413,
        code: "payload_too_large",
      });
    }
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_JSON_BODY_BYTES) {
      throw new HarnessError("Request body is too large.", {
        status: 413,
        code: "payload_too_large",
      });
    }
    const body = JSON.parse(raw) as unknown;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Request body must be a JSON object.");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HarnessError) throw error;
    throw new HarnessError(`Invalid JSON body: ${toErrorMessage(error)}`, {
      status: 400,
      code: "invalid_body",
    });
  }
}

export function streamResponse(
  events: AsyncGenerator<StreamEvent>,
  onCancel?: () => void,
): Response {
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(sseEncode(event)));
        } catch {
          cancelled = true;
        }
      };
      try {
        for await (const event of events) {
          if (cancelled) break;
          send(event);
        }
      } catch (error) {
        send({ type: "error", message: toErrorMessage(error), code: "stream_error" });
      } finally {
        if (!cancelled) {
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      }
    },
    cancel() {
      cancelled = true;
      try {
        onCancel?.();
      } catch {
        // ignore
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function httpGet(
  url: string,
  options: RequestInit & { signal?: AbortSignal } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers: {
        "User-Agent": "Sarkari/1.0",
        ...options.headers,
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
