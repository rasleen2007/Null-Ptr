export interface SseLine {
  event?: string;
  data: string;
}

export async function* iterateSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseLine> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // SSE is specified to allow CRLF (and bare CR) line endings. Gemini sends
  // "\r\n\r\n" block separators, so normalising to "\n" before splitting keeps
  // every frame parseable. Newlines inside JSON strings are escaped, so this
  // cannot corrupt a payload.
  const normalize = (value: string) => value.replace(/\r\n?/g, "\n");
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = normalize(buffer + decoder.decode(value, { stream: true }));
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const parsed = parseSseBlock(raw);
        if (parsed) yield parsed;
        boundary = buffer.indexOf("\n\n");
      }
    }
    buffer = normalize(buffer + decoder.decode());
    if (buffer.trim()) {
      const parsed = parseSseBlock(buffer);
      if (parsed) yield parsed;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(raw: string): SseLine | null {
  const dataLines: string[] = [];
  let event: string | undefined;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (!dataLines.length) return null;
  return { event, data: dataLines.join("\n") };
}

export async function* iterateJsonLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf("\n");
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) yield line;
        index = buffer.indexOf("\n");
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) yield buffer.trim();
  } finally {
    reader.releaseLock();
  }
}

export function createTimeoutSignal(parent: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  const onAbort = () => controller.abort(parent?.reason);
  if (parent) {
    if (parent.aborted) controller.abort(parent.reason);
    else parent.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timer);
      parent?.removeEventListener("abort", onAbort);
    },
  };
}
