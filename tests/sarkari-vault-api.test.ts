import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, promises as fs } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DELETE as DELETE_FIELD } from "@/app/api/vault/fields/[placeholder]/route";
import { DELETE, GET, POST } from "@/app/api/vault/route";
import {
  getSecretMap,
  rememberValue,
  resetVaultForTests,
  unlockVault,
} from "@/sarkari/vault";

const PASSPHRASE = "correct horse battery staple";
const AADHAAR = "999941057058";
const NAME = "Rahul Sharma";
const PLACEHOLDER = "{{AADHAAR_1}}";

let dir: string;
let vaultFile: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "sarkari-vault-api-"));
  vaultFile = path.join(dir, "vault.enc.json");
  process.env.JARVIS_VAULT_FILE = vaultFile;
  resetVaultForTests();
});

afterEach(async () => {
  resetVaultForTests();
  delete process.env.JARVIS_VAULT_FILE;
  await rm(dir, { recursive: true, force: true });
});

function postVault(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/vault", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe("vault API", () => {
  it("creates, reports, and never serializes real values", async () => {
    const created = await postVault({ action: "unlock", passphrase: PASSPHRASE });
    expect(created.status).toBe(200);
    expect(await bodyOf(created)).toMatchObject({ exists: true, unlocked: true, fieldCount: 0 });

    await rememberValue("aadhaar", AADHAAR);
    await rememberValue("name", NAME, "Applicant");

    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await bodyOf(response);

    expect(body).toMatchObject({
      exists: true,
      unlocked: true,
      fieldCount: 2,
    });
    const fields = body.fields as Array<Record<string, unknown>>;
    expect(fields.map((field) => field.placeholder)).toEqual(["{{AADHAAR_1}}", "{{NAME_1}}"]);
    expect(fields[0]).toMatchObject({ type: "aadhaar" });
    expect(fields[1]).toMatchObject({ type: "name", label: "Applicant" });

    // The critical invariant: metadata only, no plaintext anywhere in the payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(AADHAAR);
    expect(serialized).not.toContain(NAME);

    // Nor is plaintext sitting in the encrypted file.
    const onDisk = await readFile(vaultFile, "utf8");
    expect(onDisk).not.toContain(AADHAAR);
    expect(onDisk).not.toContain(NAME);
  });

  it("locks, rejects a wrong passphrase distinctly, and unlocks again", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);

    const locked = await postVault({ action: "lock" });
    expect(locked.status).toBe(200);
    expect(await bodyOf(locked)).toMatchObject({ unlocked: false, fields: [] });
    expect(getSecretMap().size).toBe(0);

    const lockedGet = await bodyOf(await GET());
    expect(lockedGet).toMatchObject({ exists: true, unlocked: false, fieldCount: 0, fields: [] });
    expect(JSON.stringify(lockedGet)).not.toContain(AADHAAR);

    const wrong = await postVault({ action: "unlock", passphrase: "definitely wrong" });
    expect(wrong.status).toBe(401);
    expect(await bodyOf(wrong)).toMatchObject({ code: "wrong_passphrase" });
    expect(JSON.stringify(await bodyOf(await GET()))).not.toContain(AADHAAR);

    const unlocked = await postVault({ action: "unlock", passphrase: PASSPHRASE });
    expect(unlocked.status).toBe(200);
    const unlockedBody = await bodyOf(unlocked);
    expect(unlockedBody).toMatchObject({ unlocked: true, fieldCount: 1 });
    expect((unlockedBody.fields as Array<Record<string, unknown>>)[0].placeholder).toBe(
      PLACEHOLDER,
    );
    expect(JSON.stringify(unlockedBody)).not.toContain(AADHAAR);
  });

  it("validates actions and passphrases", async () => {
    const missingPassphrase = await postVault({ action: "unlock" });
    expect(missingPassphrase.status).toBe(400);
    expect(await bodyOf(missingPassphrase)).toMatchObject({ code: "invalid_body" });

    const shortPassphrase = await postVault({ action: "unlock", passphrase: "short" });
    expect(shortPassphrase.status).toBe(400);
    expect(await bodyOf(shortPassphrase)).toMatchObject({ code: "invalid_input" });

    const unknown = await postVault({ action: "explode" });
    expect(unknown.status).toBe(400);
    expect(await bodyOf(unknown)).toMatchObject({ code: "invalid_body" });
  });

  it("forgets a single field without exposing its value", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);
    await rememberValue("name", NAME);

    const response = await DELETE_FIELD(new Request("http://localhost/api/vault/fields/x"), {
      params: Promise.resolve({ placeholder: encodeURIComponent(PLACEHOLDER) }),
    });
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ unlocked: true, fieldCount: 1 });
    expect((body.fields as Array<Record<string, unknown>>).map((field) => field.placeholder)).toEqual(
      ["{{NAME_1}}"],
    );
    expect(JSON.stringify(body)).not.toContain(AADHAAR);
    expect(getSecretMap().has(PLACEHOLDER)).toBe(false);
    expect(getSecretMap().has("{{NAME_1}}")).toBe(true);
  });

  it("returns 423 when forgetting while locked and 404 for unknown fields", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);
    await postVault({ action: "lock" });

    const locked = await DELETE_FIELD(new Request("http://localhost/api/vault/fields/x"), {
      params: Promise.resolve({ placeholder: PLACEHOLDER }),
    });
    expect(locked.status).toBe(423);
    expect(await bodyOf(locked)).toMatchObject({ code: "vault_locked" });

    await unlockVault(PASSPHRASE);
    const missing = await DELETE_FIELD(new Request("http://localhost/api/vault/fields/x"), {
      params: Promise.resolve({ placeholder: "{{PHONE_9}}" }),
    });
    expect(missing.status).toBe(404);
    expect(await bodyOf(missing)).toMatchObject({ code: "not_found" });

    const invalid = await DELETE_FIELD(new Request("http://localhost/api/vault/fields/x"), {
      params: Promise.resolve({ placeholder: "not-a-placeholder" }),
    });
    expect(invalid.status).toBe(400);
    expect(await bodyOf(invalid)).toMatchObject({ code: "invalid_placeholder" });
  });

  it("wipes the encrypted file", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("aadhaar", AADHAAR);
    expect(existsSync(vaultFile)).toBe(true);

    const response = await DELETE();
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({ exists: false, unlocked: false, fields: [] });
    expect(existsSync(vaultFile)).toBe(false);
    expect(getSecretMap().size).toBe(0);
  });
});
