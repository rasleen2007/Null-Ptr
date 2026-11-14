import { HarnessError } from "@/harness/errors";
import { jsonOk, readJson } from "@/lib/http";
import { vaultJsonError, vaultSnapshot } from "@/lib/vault-api";
import { lockVault, unlockVault, wipeVault } from "@/sarkari/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return jsonOk(vaultSnapshot());
}

export async function POST(req: Request) {
  try {
    const body = await readJson(req);
    const action = body.action;
    if (action === "unlock") {
      if (typeof body.passphrase !== "string") {
        throw new HarnessError("A passphrase is required to unlock the vault.", {
          status: 400,
          code: "invalid_body",
        });
      }
      await unlockVault(body.passphrase);
      return jsonOk(vaultSnapshot());
    }
    if (action === "lock") {
      lockVault();
      return jsonOk(vaultSnapshot());
    }
    throw new HarnessError('Unknown vault action. Use "unlock" or "lock".', {
      status: 400,
      code: "invalid_body",
    });
  } catch (error) {
    return vaultJsonError(error);
  }
}

export async function DELETE() {
  try {
    await wipeVault();
    return jsonOk(vaultSnapshot());
  } catch (error) {
    return vaultJsonError(error);
  }
}
