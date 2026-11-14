import { NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import {
  getFields,
  getVaultStatus,
  VaultError,
  type VaultErrorCode,
  type VaultField,
  type VaultStatus,
} from "@/sarkari/vault";

/**
 * Map vault failures onto distinct HTTP responses.
 *
 * The UI needs to tell a mistyped passphrase apart from a damaged vault file, but
 * the response body must never echo stored values. `VaultError` messages are
 * deliberately generic, so they are safe to surface.
 */

export interface VaultSnapshot extends VaultStatus {
  fields: VaultField[];
}

/** Status plus metadata only. `getFields` never returns stored values. */
export function vaultSnapshot(): VaultSnapshot {
  return { ...getVaultStatus(), fields: getFields() };
}

const STATUS_BY_CODE: Record<VaultErrorCode, number> = {
  vault_locked: 423,
  vault_missing: 404,
  wrong_passphrase: 401,
  corrupt_vault: 500,
  invalid_input: 400,
};

export function vaultJsonError(error: unknown): NextResponse {
  if (error instanceof VaultError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      {
        status: STATUS_BY_CODE[error.code],
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
  return jsonError(error);
}
