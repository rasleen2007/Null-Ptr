import path from "node:path";

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".lan", ".home", ".corp"];
const BLOCKED_HOSTS = new Set(["localhost", "0.0.0.0", "[::1]", "::1", "metadata.google.internal"]);

function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  if (!parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) return false;
  const [a, b] = parts.map(Number);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized === "::1" || normalized === "::") return true;
  if (/^f[cd][0-9a-f]{2}:/.test(normalized)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(normalized)) return true;
  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice("::ffff:".length));
  }
  return false;
}

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export function assertSafeUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError("Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError("Only http and https URLs are allowed.");
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError("URLs with embedded credentials are not allowed.");
  }
  const host = url.hostname.toLowerCase();
  if (!host) throw new UnsafeUrlError("URL has no hostname.");
  if (BLOCKED_HOSTS.has(host)) throw new UnsafeUrlError(`Host "${host}" is blocked.`);
  if (BLOCKED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new UnsafeUrlError(`Host "${host}" is blocked (private suffix).`);
  }
  if (/^\d+$/.test(host)) throw new UnsafeUrlError("Numeric hostnames are blocked.");
  if (isPrivateIpv4(host)) throw new UnsafeUrlError(`Private IPv4 address "${host}" is blocked.`);
  if (host.includes(":") && isPrivateIpv6(host)) {
    throw new UnsafeUrlError(`Private IPv6 address "${host}" is blocked.`);
  }
  return url;
}

export interface SandboxPath {
  root: string;
  absolute: string;
  relative: string;
}

export function resolveSandboxPath(workspaceDir: string, target: string): SandboxPath {
  const root = path.resolve(process.cwd(), workspaceDir);
  const absolute = path.resolve(root, target || ".");
  const relative = path.relative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new UnsafeUrlError("Path escapes the JARVIS workspace sandbox.");
  }
  return { root, absolute, relative: relative || "." };
}
