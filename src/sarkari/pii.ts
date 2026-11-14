/**
 * Deterministic PII detection for Indian government paperwork.
 *
 * Detection is intentionally conservative: a false negative is caught again by the
 * outbound guard, while a false positive would annoy the user on every message.
 * Everything here is pure and synchronous so it can run inside the request path.
 */

export type PiiType =
  | "aadhaar"
  | "pan"
  | "phone"
  | "email"
  | "ifsc"
  | "upi"
  | "account"
  | "dob"
  | "address"
  | "name"
  | "other";

export interface DetectedPii {
  type: PiiType;
  /** Normalised form used for de-duplication inside the vault. */
  value: string;
  /** Exact substring found in the source text. */
  raw: string;
  start: number;
  end: number;
}

const PLACEHOLDER_PREFIX: Record<PiiType, string> = {
  aadhaar: "AADHAAR",
  pan: "PAN",
  phone: "PHONE",
  email: "EMAIL",
  ifsc: "IFSC",
  upi: "UPI",
  account: "ACCOUNT",
  dob: "DOB",
  address: "ADDRESS",
  name: "NAME",
  other: "PII",
};

export function placeholderPrefix(type: PiiType): string {
  return PLACEHOLDER_PREFIX[type];
}

/** Verhoeff multiplication table. */
const V_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

/** Verhoeff permutation table. */
const V_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const V_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Validate a complete 12-digit Aadhaar number (including its Verhoeff check digit).
 * This keeps 12-digit bank references from being mislabelled as Aadhaar.
 */
export function verhoeffCheckDigit(number: string): number {
  const digits = number.replace(/\D/g, "").split("").reverse();
  let checksum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    checksum = V_D[checksum][V_P[(index + 1) % 8][Number(digits[index])]];
  }
  return V_INV[checksum];
}

export function verhoeffValidate(number: string): boolean {
  const digits = number.replace(/\D/g, "");
  if (!digits) return false;
  let checksum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index]);
    checksum = V_D[checksum][V_P[index % 8][digit]];
  }
  return checksum === 0;
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const UPI_RE =
  /(?<![A-Z0-9._-])[A-Z0-9._-]{2,}@(?:okaxis|oksbi|okhdfcbank|okicici|ybl|paytm|upi|apl|ibl|axl|airtel|fbl|jio|sbi|hdfcbank|icici|axisbank|kotak|yesbank)(?![A-Z0-9])/gi;
const PAN_RE = /(?<![A-Z0-9])[A-Z]{5}[0-9]{4}[A-Z](?![A-Z0-9])/gi;
const IFSC_RE = /(?<![A-Z0-9])[A-Z]{4}0[A-Z0-9]{6}(?![A-Z0-9])/gi;
const AADHAAR_RE = /(?<!\d)(\d{4}[\s-]?\d{4}[\s-]?\d{4})(?!\d)/g;
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const ACCOUNT_RE =
  /(?:account|a\/c|acct|khata|खाता)\s*(?:no\.?|number|संख्या)?\s*[:\-]?\s*(\d{9,18})/gi;
const DOB_RE =
  /(?:dob|d\.o\.b\.?|date\s+of\s+birth|जन्म\s*(?:तिथि|दिनांक))\s*[:\-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi;

function canonicalizeRaw(type: PiiType, raw: string): string {
  const trimmed = raw.trim();
  switch (type) {
    case "aadhaar":
    case "account":
      return trimmed.replace(/\D/g, "");
    case "phone": {
      const hasCountryCode = /^\+?91/.test(trimmed.replace(/[\s-]/g, ""));
      const digits = trimmed.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
      return hasCountryCode ? `+91${digits}` : digits;
    }
    case "pan":
    case "ifsc":
      return trimmed.replace(/\s/g, "").toUpperCase();
    case "email":
    case "upi":
      return trimmed.toLowerCase();
    case "dob":
      return trimmed;
    default:
      return trimmed;
  }
}

export function canonicalizePii(type: PiiType, raw: string): string {
  return canonicalizeRaw(type, raw);
}

interface Candidate {
  type: PiiType;
  raw: string;
  start: number;
  end: number;
  group?: number;
}

function collect(
  text: string,
  regex: RegExp,
  type: PiiType,
  validate?: (raw: string) => boolean,
  group?: number,
): Candidate[] {
  const results: Candidate[] = [];
  for (const match of text.matchAll(regex)) {
    const raw = group === undefined ? match[0] : match[group];
    if (!raw) continue;
    if (validate && !validate(raw)) continue;
    const offset = match.index ?? 0;
    const start = group === undefined ? offset : offset + match[0].indexOf(raw);
    results.push({ type, raw, start, end: start + raw.length, group });
  }
  return results;
}

/**
 * Detect all supported identifiers. Overlapping matches are resolved in favour of
 * the left-most, longest match so a phone number inside a longer identifier is
 * never emitted twice.
 */
export function detectPII(text: string): DetectedPii[] {
  if (!text) return [];
  const candidates: Candidate[] = [
    ...collect(text, EMAIL_RE, "email"),
    ...collect(text, UPI_RE, "upi"),
    ...collect(text, PAN_RE, "pan"),
    ...collect(text, IFSC_RE, "ifsc"),
    ...collect(text, AADHAAR_RE, "aadhaar", verhoeffValidate),
    ...collect(text, PHONE_RE, "phone"),
    ...collect(text, ACCOUNT_RE, "account", undefined, 1),
    ...collect(text, DOB_RE, "dob", undefined, 1),
  ];

  candidates.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

  const resolved: DetectedPii[] = [];
  let lastEnd = -1;
  for (const candidate of candidates) {
    if (candidate.start < lastEnd) continue;
    resolved.push({
      type: candidate.type,
      value: canonicalizeRaw(candidate.type, candidate.raw),
      raw: candidate.raw,
      start: candidate.start,
      end: candidate.end,
    });
    lastEnd = candidate.end;
  }
  return resolved;
}

export function hasPii(text: string): boolean {
  return detectPII(text).length > 0;
}
