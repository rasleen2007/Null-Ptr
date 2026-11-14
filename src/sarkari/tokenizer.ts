import { detectPII, type DetectedPii, type PiiType } from "./pii";
import {
  findFieldByValue,
  getSecretEntries,
  getSecretMap,
  isVaultUnlocked,
  rememberValue,
  type VaultField,
} from "./vault";

/**
 * Placeholder tokenizer.
 *
 * Ingress: detect PII and replace it with a stable `{{TYPE_N}}` token, storing the
 * real value in the encrypted vault. Egress to a tool (and only at the execution
 * edge) calls `restore`. The browser and the model only ever see tokens.
 */

export const PLACEHOLDER_PATTERN = /\{\{([A-Z][A-Z0-9_]*)_(\d+)\}\}/g;

const MIN_SECRET_LENGTH = 3;

export interface RedactionReport {
  /** Every identifier found in the input, before redaction. */
  detected: DetectedPii[];
  /** Fields newly written to the vault during this call. */
  stored: VaultField[];
  /** True when PII was found while the vault was locked. */
  locked: boolean;
  /** Detected identifiers that could not be replaced with a placeholder. */
  unknown: DetectedPii[];
  placeholders: string[];
  types: PiiType[];
}

export interface RedactOptions {
  /** Defaults to true. Set false to detect without writing to the vault. */
  autoStore?: boolean;
}

function emptyReport(): RedactionReport {
  return {
    detected: [],
    stored: [],
    locked: false,
    unknown: [],
    placeholders: [],
    types: [],
  };
}

function uniqueTypes(detected: DetectedPii[]): PiiType[] {
  return [...new Set(detected.map((entry) => entry.type))];
}

/**
 * Replace PII in `text` with vault placeholders.
 *
 * When the vault is locked the text is returned untouched and every detected
 * identifier is reported in `unknown`; callers should reject the turn rather than
 * send it. When storage is disabled (`autoStore: false`) known values are still
 * replaced but new ones are reported instead of being saved.
 */
export async function redact(
  text: string,
  _fields: VaultField[] = [],
  options: RedactOptions = {},
): Promise<{ text: string; report: RedactionReport }> {
  if (!text) return { text, report: emptyReport() };

  const detected = detectPII(text);
  if (!detected.length) return { text, report: emptyReport() };

  const report = emptyReport();
  report.detected = detected;
  report.types = uniqueTypes(detected);

  if (!isVaultUnlocked()) {
    report.locked = true;
    report.unknown = [...detected];
    return { text, report };
  }

  const autoStore = options.autoStore !== false;
  const replacements: Array<{ start: number; end: number; placeholder: string }> = [];
  const seenPlaceholders = new Set<string>();

  for (const entry of detected) {
    let field = findFieldByValue(entry.type, entry.value);
    if (!field && autoStore) {
      field = await rememberValue(entry.type, entry.value);
      report.stored.push(field);
    }
    if (!field) {
      report.unknown.push(entry);
      continue;
    }
    replacements.push({ start: entry.start, end: entry.end, placeholder: field.placeholder });
    if (!seenPlaceholders.has(field.placeholder)) {
      seenPlaceholders.add(field.placeholder);
      report.placeholders.push(field.placeholder);
    }
  }

  replacements.sort((a, b) => b.start - a.start);
  let output = text;
  for (const replacement of replacements) {
    output = `${output.slice(0, replacement.start)}${replacement.placeholder}${output.slice(replacement.end)}`;
  }

  return { text: output, report };
}

/**
 * Synchronous scrub for text that must not contain a known vault value (assistant
 * output, tool arguments, logs). This does not detect new PII — use `redact` or the
 * outbound guard for that.
 */
export function redactForModel(text: string, _fields: VaultField[] = []): string {
  if (!text) return text;
  let output = text;
  const entries = getSecretEntries()
    .filter((entry) => entry.value.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.value.length - a.value.length);
  for (const entry of entries) {
    if (output.includes(entry.value)) {
      output = output.split(entry.value).join(entry.placeholder);
    }
  }
  return output;
}

/** Replace placeholders with real values. Only call this at the tool execution edge. */
export function restore(text: string, _fields: VaultField[] = []): string {
  if (!text) return text;
  const secrets = getSecretMap();
  return text.replace(PLACEHOLDER_PATTERN, (match) => secrets.get(match) ?? match);
}

/** Recursively restore placeholders inside tool arguments. */
export function restoreDeep<T>(value: T, fields: VaultField[] = []): T {
  if (typeof value === "string") return restore(value, fields) as unknown as T;
  if (Array.isArray(value)) {
    return value.map((entry) => restoreDeep(entry, fields)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      output[key] = restoreDeep(entry, fields);
    }
    return output as T;
  }
  return value;
}

export function extractPlaceholders(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) found.add(match[0]);
  return [...found];
}

export function isPlaceholder(text: string): boolean {
  return /^\{\{[A-Z][A-Z0-9_]*_\d+\}\}$/.test(text);
}

/** True when any unlocked vault value appears verbatim in `text`. */
export function containsKnownValue(text: string): boolean {
  if (!text) return false;
  return getSecretEntries().some(
    (entry) => entry.value.length >= MIN_SECRET_LENGTH && text.includes(entry.value),
  );
}
