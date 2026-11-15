const BEARER_PREFIX = "bearer ";

import { envValue } from "./env";

export function isAccessTokenRequired(): boolean {
  return Boolean(envValue("SAATHI_ACCESS_TOKEN", "JARVIS_ACCESS_TOKEN"));
}

export function accessTokenFromHeaders(headers: Headers): string | undefined {
  const authorization = headers.get("authorization")?.trim();
  if (authorization && authorization.toLowerCase().startsWith(BEARER_PREFIX)) {
    const token = authorization.slice(BEARER_PREFIX.length).trim();
    if (token) return token;
  }
  const headerToken = headers.get("x-saathi-token")?.trim();
  return headerToken || undefined;
}

async function digest(value: string): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

export async function verifyAccessToken(provided: string | undefined): Promise<boolean> {
  const expected = envValue("SAATHI_ACCESS_TOKEN", "JARVIS_ACCESS_TOKEN");
  if (!expected) return true;
  if (!provided) return false;
  const [actualHash, expectedHash] = await Promise.all([digest(provided), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < actualHash.length; i += 1) {
    difference |= actualHash[i] ^ expectedHash[i];
  }
  return difference === 0;
}
