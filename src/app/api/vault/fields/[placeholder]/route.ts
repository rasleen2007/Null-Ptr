import { HarnessError } from "@/harness/errors";
import { jsonOk } from "@/lib/http";
import { vaultJsonError, vaultSnapshot } from "@/lib/vault-api";
import { forgetField } from "@/sarkari/vault";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ placeholder: string }> };

const PLACEHOLDER_RE = /^\{\{[A-Z0-9_]+\}\}$/;

export async function DELETE(_req: Request, context: Params) {
  try {
    const { placeholder: raw } = await context.params;
    let placeholder = raw;
    try {
      placeholder = decodeURIComponent(raw);
    } catch {
      // Next already decodes path segments; a malformed escape stays as-is and
      // fails the shape check below.
    }

    if (!PLACEHOLDER_RE.test(placeholder)) {
      throw new HarnessError("Invalid vault placeholder.", {
        status: 400,
        code: "invalid_placeholder",
      });
    }

    const forgotten = await forgetField(placeholder);
    if (!forgotten) {
      throw new HarnessError("That field is not in the vault.", {
        status: 404,
        code: "not_found",
      });
    }
    return jsonOk(vaultSnapshot());
  } catch (error) {
    return vaultJsonError(error);
  }
}
