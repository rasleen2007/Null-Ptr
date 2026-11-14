import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  VaultError,
  forgetField,
  getFields,
  getSecretMap,
  getVaultStatus,
  isVaultUnlocked,
  lockVault,
  rememberValue,
  resetVaultForTests,
  unlockVault,
  wipeVault,
} from "@/sarkari/vault";

const PASSPHRASE = "correct horse battery staple";

let dir: string;
let vaultFile: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "sarkari-vault-"));
  vaultFile = path.join(dir, "vault.enc.json");
  process.env.JARVIS_VAULT_FILE = vaultFile;
  resetVaultForTests();
});

afterEach(async () => {
  resetVaultForTests();
  delete process.env.JARVIS_VAULT_FILE;
  await rm(dir, { recursive: true, force: true });
});

describe("vault lifecycle", () => {
  it("creates an unlocked vault on first use and persists only ciphertext", async () => {
    const status = await unlockVault(PASSPHRASE);
    expect(status.unlocked).toBe(true);
    expect(status.exists).toBe(true);
    expect(status.fieldCount).toBe(0);

    const field = await rememberValue("aadhaar", "999941057058");
    expect(field.placeholder).toBe("{{AADHAAR_1}}");
    expect(isVaultUnlocked()).toBe(true);

    const raw = await readFile(vaultFile, "utf8");
    expect(raw).not.toContain("999941057058");
    expect(raw).not.toContain("AADHAAR");
    expect(JSON.parse(raw)).toMatchObject({ version: 1, ciphertext: expect.any(String) });

    const fields = getFields();
    expect(fields).toHaveLength(1);
    expect(fields[0]).not.toHaveProperty("value");
    expect(JSON.stringify(fields)).not.toContain("999941057058");
  });

  it("locks, clears secrets from memory, and reopens with the same passphrase", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("pan", "ABCDE1234F");

    lockVault();
    expect(getVaultStatus().unlocked).toBe(false);
    expect(getFields()).toHaveLength(0);
    expect(getSecretMap().size).toBe(0);

    const reopened = await unlockVault(PASSPHRASE);
    expect(reopened.unlocked).toBe(true);
    expect(reopened.fieldCount).toBe(1);
    expect(getSecretMap().get("{{PAN_1}}")).toBe("ABCDE1234F");
  });

  it("reports a wrong passphrase distinctly", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("phone", "9876543210");
    lockVault();

    await expect(unlockVault("definitely not it")).rejects.toMatchObject({
      code: "wrong_passphrase",
    });
    expect(getVaultStatus().unlocked).toBe(false);
  });

  it("detects tampered ciphertext", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("email", "rahul@example.com");
    lockVault();

    const file = JSON.parse(await readFile(vaultFile, "utf8"));
    const bytes = Buffer.from(file.ciphertext, "base64");
    bytes[bytes.length - 1] ^= 0xff;
    file.ciphertext = bytes.toString("base64");
    await writeFile(vaultFile, JSON.stringify(file), "utf8");
    resetVaultForTests();

    await expect(unlockVault(PASSPHRASE)).rejects.toBeInstanceOf(VaultError);
    await expect(unlockVault(PASSPHRASE)).rejects.toMatchObject({ code: "corrupt_vault" });
  });

  it("refuses writes while locked", async () => {
    await expect(rememberValue("aadhaar", "999941057058")).rejects.toMatchObject({
      code: "vault_locked",
    });
  });
});

describe("vault values", () => {
  it("reuses a stable placeholder for the same canonical value", async () => {
    await unlockVault(PASSPHRASE);
    const first = await rememberValue("aadhaar", "999941057058");
    const second = await rememberValue("aadhaar", "9999 4105 7058");
    expect(second.placeholder).toBe(first.placeholder);
    expect(getFields()).toHaveLength(1);
  });

  it("numbers placeholders per identifier type", async () => {
    await unlockVault(PASSPHRASE);
    expect((await rememberValue("aadhaar", "999941057058")).placeholder).toBe("{{AADHAAR_1}}");
    expect((await rememberValue("aadhaar", "200000000009")).placeholder).toBe("{{AADHAAR_2}}");
    expect((await rememberValue("pan", "ABCDE1234F")).placeholder).toBe("{{PAN_1}}");
  });

  it("forgets a single field and wipes the vault", async () => {
    await unlockVault(PASSPHRASE);
    await rememberValue("pan", "ABCDE1234F");
    await rememberValue("phone", "9876543210");

    expect(await forgetField("{{PAN_1}}")).toBe(true);
    expect(await forgetField("{{PAN_1}}")).toBe(false);
    expect(getFields().map((field) => field.type)).toEqual(["phone"]);

    await wipeVault();
    expect(getVaultStatus().exists).toBe(false);
    expect(getVaultStatus().unlocked).toBe(false);
  });
});
