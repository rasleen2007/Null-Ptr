import { detectPII, type DetectedPii, type PiiType } from "./pii";
import {
  containsKnownValue,
  redact,
  redactForModel,
  type RedactionReport,
} from "./tokenizer";
import type { VaultField } from "./vault";

/**
 * Final check before a request leaves the process.
 *
 * Ingress redaction is the primary defence; this guard is the second verifier. It
 * scrubs any vault value that slipped into assistant/tool text and routes the turn
 * to the local Ollama model when unknown PII remains.
 */

export type GuardRoute = "cloud" | "ollama";

export interface GuardReport {
  redacted: boolean;
  detected: PiiType[];
  unknown: DetectedPii[];
  verifiedClean: boolean;
  route: GuardRoute;
  reason: "clean" | "unknown_pii" | "forced_local";
}

export interface GuardOptions {
  /** Force the turn onto the local model regardless of content. */
  forceLocal?: boolean;
  /** Defaults to true. When false, detected PII is reported but not stored. */
  autoStore?: boolean;
}

export interface GuardedMessage {
  content: string;
}

export interface GuardOutcome<T extends GuardedMessage> {
  messages: T[];
  route: GuardRoute;
  report: GuardReport;
}

function mergeUnknown(target: DetectedPii[], additions: DetectedPii[]): void {
  const seen = new Set(target.map((entry) => `${entry.type}:${entry.value}`));
  for (const entry of additions) {
    const key = `${entry.type}:${entry.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    target.push(entry);
  }
}

export async function guardOutbound<T extends GuardedMessage>(
  messages: T[],
  fields: VaultField[] = [],
  options: GuardOptions = {},
): Promise<GuardOutcome<T>> {
  const unknown: DetectedPii[] = [];
  const detectedTypes = new Set<PiiType>();
  let anyRedacted = false;
  let verifiedClean = true;

  const guarded: T[] = [];
  for (const message of messages) {
    const original = message.content;
    if (!original) {
      guarded.push(message);
      continue;
    }

    const result = await redact(original, fields, { autoStore: options.autoStore });
    const outcome: RedactionReport = result.report;
    let content = redactForModel(result.text, fields);

    for (const type of outcome.types) detectedTypes.add(type);
    mergeUnknown(unknown, outcome.unknown);
    mergeUnknown(unknown, detectPII(content));

    // A second scrub catches values that were reconstructed by the first pass.
    if (containsKnownValue(content)) {
      content = redactForModel(content, fields);
    }

    const leftovers = detectPII(content);
    if (leftovers.length) {
      verifiedClean = false;
      mergeUnknown(unknown, leftovers);
      for (const entry of leftovers) detectedTypes.add(entry.type);
    }
    if (containsKnownValue(content)) verifiedClean = false;

    if (content !== original) anyRedacted = true;
    guarded.push(content === original ? message : { ...message, content });
  }

  const route: GuardRoute =
    options.forceLocal || unknown.length > 0 ? "ollama" : "cloud";
  const reason = options.forceLocal
    ? "forced_local"
    : unknown.length > 0
      ? "unknown_pii"
      : "clean";

  return {
    messages: guarded,
    route,
    report: {
      redacted: anyRedacted,
      detected: [...detectedTypes],
      unknown,
      verifiedClean,
      route,
      reason,
    },
  };
}
