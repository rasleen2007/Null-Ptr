import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { canonicalizePii, placeholderPrefix, type PiiType } from "./pii";
import { envValue } from "../lib/env";

/**
 * Encrypted personal vault.
 *
 * The vault lives only on the server. Plaintext values are kept in memory while it
 * is unlocked and are never returned by `getFields`, so nothing in this module can
 * accidentally hand a real Aadhaar number to the browser.
 */

export type VaultErrorCode =
  | "vault_locked"
  | "vault_missing"
  | "wrong_passphrase"
  | "corrupt_vault"
  | "invalid_input";

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = "VaultError";
    this.code = code;
  }
}

export interface VaultField {
  placeholder: string;
  type: PiiType;
  label?: string;
  createdAt: string;
}

interface StoredVaultField extends VaultField {
  value: string;
}

export interface VaultStatus {
  exists: boolean;
  unlocked: boolean;
  fieldCount: number;
  updatedAt?: string;
}

interface VaultFile {
  version: 1;
  salt: string;
  /** HMAC of a fixed label; lets us report a wrong passphrase distinctly from tampering. */
  check: string;
  iv: string;
  tag: string;
  ciphertext: string;
  updatedAt: string;
}

interface VaultBody {
  version: 1;
  fields: StoredVaultField[];
}

interface VaultSession {
  unlocked: boolean;
  filePath: string;
  key: Buffer | null;
  fields: StoredVaultField[];
  updatedAt?: string;
  salt: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __saathiSarkariVault: VaultSession | undefined;
}

const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: typeof SCRYPT_OPTIONS,
) => Promise<Buffer>;

const PLACEHOLDER_RE = /^\{\{([A-Z][A-Z0-9_]*)_(\d+)\}\}$/;

export function getVaultPath(): string {
  return (
    envValue("SAATHI_VAULT_FILE", "JARVIS_VAULT_FILE") ||
    path.join(process.cwd(), ".data", "vault.enc.json")
  );
}

function emptySession(filePath: string): VaultSession {
  return { unlocked: false, filePath, key: null, fields: [], salt: "" };
}

function getSession(): VaultSession {
  const filePath = getVaultPath();
  if (!globalThis.__saathiSarkariVault || globalThis.__saathiSarkariVault.filePath !== filePath) {
    globalThis.__saathiSarkariVault = emptySession(filePath);
  }
  return globalThis.__saathiSarkariVault;
}

function requireUnlocked(): VaultSession {
  const session = getSession();
  if (!session.unlocked || !session.key) {
    throw new VaultError("vault_locked", "The personal vault is locked.");
  }
  return session;
}

async function deriveKey(passphrase: string, salt: Buffer): Promise<Buffer> {
  if (!passphrase || passphrase.length < 6) {
    throw new VaultError("invalid_input", "Vault passphrase must be at least 6 characters.");
  }
  return scryptAsync(passphrase.normalize("NFKC"), salt, 32, SCRYPT_OPTIONS);
}

function keyCheck(key: Buffer): string {
  return createHmac("sha256", key).update("jarvis-sarkari-vault-v1").digest("base64");
}

function checkMatches(expected: string, key: Buffer): boolean {
  const actual = Buffer.from(keyCheck(key), "base64");
  const provided = Buffer.from(expected, "base64");
  if (actual.length !== provided.length) return false;
  return timingSafeEqual(actual, provided);
}

function encryptBody(body: VaultBody, key: Buffer): { iv: string; tag: string; ciphertext: string } {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(body), "utf8"),
    cipher.final(),
  ]);
  return {
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptBody(file: VaultFile, key: Buffer): VaultBody {
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(file.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(file.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(file.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
    const body = JSON.parse(plaintext) as VaultBody;
    if (body.version !== 1 || !Array.isArray(body.fields)) {
      throw new Error("Unexpected vault body");
    }
    return body;
  } catch {
    // GCM authentication failure and malformed plaintext are indistinguishable here.
    throw new VaultError("corrupt_vault", "The vault could not be decrypted.");
  }
}

function nextPlaceholder(type: PiiType, fields: StoredVaultField[]): string {
  const prefix = placeholderPrefix(type);
  let highest = 0;
  for (const field of fields) {
    const match = PLACEHOLDER_RE.exec(field.placeholder);
    if (!match || match[1] !== prefix) continue;
    highest = Math.max(highest, Number(match[2]));
  }
  return `{{${prefix}_${highest + 1}}}`;
}

async function persist(session: VaultSession): Promise<void> {
  if (!session.key) throw new VaultError("vault_locked", "The personal vault is locked.");
  const filePath = session.filePath;
  const body: VaultBody = { version: 1, fields: session.fields };
  const encrypted = encryptBody(body, session.key);
  const updatedAt = new Date().toISOString();
  const file: VaultFile = {
    version: 1,
    salt: session.salt,
    check: keyCheck(session.key),
    iv: encrypted.iv,
    tag: encrypted.tag,
    ciphertext: encrypted.ciphertext,
    updatedAt,
  };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(file, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.rename(tmp, filePath);
  session.updatedAt = updatedAt;
}

/**
 * Unlock an existing vault or create an empty one if this is the first run.
 * A wrong passphrase surfaces as `wrong_passphrase`; tampering with the ciphertext
 * surfaces as `corrupt_vault`.
 */
export async function unlockVault(passphrase: string): Promise<VaultStatus> {
  const session = getSession();
  const exists = existsSync(session.filePath);

  if (!exists) {
    const salt = randomBytes(16);
    const key = await deriveKey(passphrase, salt);
    session.unlocked = true;
    session.key = key;
    session.salt = salt.toString("base64");
    session.fields = [];
    session.updatedAt = undefined;
    await persist(session);
    return getVaultStatus();
  }

  let parsed: VaultFile;
  try {
    parsed = JSON.parse(await fs.readFile(session.filePath, "utf8")) as VaultFile;
  } catch {
    throw new VaultError("corrupt_vault", "The vault file is not valid JSON.");
  }
  if (
    parsed.version !== 1 ||
    !parsed.salt ||
    !parsed.check ||
    !parsed.iv ||
    !parsed.tag ||
    !parsed.ciphertext
  ) {
    throw new VaultError("corrupt_vault", "The vault file has an unexpected shape.");
  }

  const salt = Buffer.from(parsed.salt, "base64");
  const key = await deriveKey(passphrase, salt);
  if (!checkMatches(parsed.check, key)) {
    key.fill(0);
    throw new VaultError("wrong_passphrase", "That passphrase does not unlock this vault.");
  }
  const body = decryptBody(parsed, key);

  session.unlocked = true;
  session.key = key;
  session.salt = parsed.salt;
  session.fields = body.fields;
  session.updatedAt = parsed.updatedAt;
  return getVaultStatus();
}

export function lockVault(): void {
  const session = getSession();
  if (session.key) session.key.fill(0);
  session.key = null;
  session.unlocked = false;
  session.fields = [];
  session.salt = "";
}

export function getVaultStatus(): VaultStatus {
  const session = getSession();
  return {
    exists: existsSync(session.filePath),
    unlocked: session.unlocked,
    fieldCount: session.fields.length,
    updatedAt: session.updatedAt,
  };
}

export function isVaultUnlocked(): boolean {
  const session = getSession();
  return session.unlocked && session.key !== null;
}

/** Metadata only — deliberately excludes the stored value. */
export function getFields(): VaultField[] {
  return getSession().fields.map(({ placeholder, type, label, createdAt }) => ({
    placeholder,
    type,
    label,
    createdAt,
  }));
}

export function findFieldByValue(type: PiiType, value: string): VaultField | undefined {
  const canonical = canonicalizePii(type, value);
  const field = getSession().fields.find(
    (entry) => entry.type === type && entry.value === canonical,
  );
  if (!field) return undefined;
  return {
    placeholder: field.placeholder,
    type: field.type,
    label: field.label,
    createdAt: field.createdAt,
  };
}

/** Server-only mapping used by `restore` at the tool execution edge. */
export function getSecretMap(): Map<string, string> {
  return new Map(getSession().fields.map((field) => [field.placeholder, field.value]));
}

/** Server-only values for the outbound leak check. */
export function getSecretEntries(): Array<{ placeholder: string; value: string }> {
  return getSession().fields.map((field) => ({
    placeholder: field.placeholder,
    value: field.value,
  }));
}

export async function rememberValue(
  type: PiiType,
  value: string,
  label?: string,
): Promise<VaultField> {
  const session = requireUnlocked();
  const canonical = canonicalizePii(type, value).trim();
  if (!canonical) {
    throw new VaultError("invalid_input", "Cannot store an empty value.");
  }

  const existing = session.fields.find(
    (field) => field.type === type && field.value === canonical,
  );
  if (existing) {
    if (label && !existing.label) {
      existing.label = label;
      await persist(session);
    }
    return {
      placeholder: existing.placeholder,
      type: existing.type,
      label: existing.label,
      createdAt: existing.createdAt,
    };
  }

  const field: StoredVaultField = {
    placeholder: nextPlaceholder(type, session.fields),
    type,
    label,
    value: canonical,
    createdAt: new Date().toISOString(),
  };
  session.fields.push(field);
  await persist(session);
  return {
    placeholder: field.placeholder,
    type: field.type,
    label: field.label,
    createdAt: field.createdAt,
  };
}

export async function forgetField(placeholder: string): Promise<boolean> {
  const session = requireUnlocked();
  const before = session.fields.length;
  session.fields = session.fields.filter((field) => field.placeholder !== placeholder);
  if (session.fields.length === before) return false;
  await persist(session);
  return true;
}

/** Permanently delete the encrypted file and clear the in-memory session. */
export async function wipeVault(): Promise<void> {
  const session = getSession();
  const filePath = session.filePath;
  lockVault();
  await fs.rm(filePath, { force: true });
}

/**
 * Test helper: drop the cached session without touching the file. Tests call this
 * between cases that point `SAATHI_VAULT_FILE` at different temporary directories.
 */
export function resetVaultForTests(): void {
  const session = globalThis.__saathiSarkariVault;
  if (session?.key) session.key.fill(0);
  globalThis.__saathiSarkariVault = undefined;
}
