import {
  accessTokenFromHeaders,
  isAccessTokenRequired,
  verifyAccessToken,
} from "@/lib/access";
import { jsonOk } from "@/lib/http";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const required = isAccessTokenRequired();
  if (!required) return jsonOk({ ok: true, authRequired: false });
  const token = accessTokenFromHeaders(req.headers);
  if (await verifyAccessToken(token)) {
    return jsonOk({ ok: true, authRequired: true });
  }
  return NextResponse.json(
    { error: "Unauthorized", code: "unauthorized" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer", "Cache-Control": "no-store" },
    },
  );
}
