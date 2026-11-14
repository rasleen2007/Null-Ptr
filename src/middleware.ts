import { NextResponse, type NextRequest } from "next/server";
import { accessTokenFromHeaders, isAccessTokenRequired, verifyAccessToken } from "./lib/access";
import { checkRateLimit, pruneExpiredRateLimits } from "./lib/rate-limit";

const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth"]);

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim() || "unknown";
  return req.headers.get("x-real-ip")?.trim() || "local";
}

function limitForPath(pathname: string): number {
  if (pathname === "/api/chat" || /^\/api\/runs\/[^/]+\/resume$/.test(pathname)) {
    return positiveInt(process.env.JARVIS_CHAT_RATE_LIMIT_MAX, 60);
  }
  return positiveInt(process.env.JARVIS_RATE_LIMIT_MAX, 240);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (req.method === "OPTIONS") return NextResponse.next();

  pruneExpiredRateLimits();
  const windowMs = positiveInt(process.env.JARVIS_RATE_LIMIT_WINDOW_MS, 60_000);
  const limit = limitForPath(pathname);
  const result = checkRateLimit(`${clientIp(req)}:${pathname}`, { limit, windowMs });

  if (!result.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Slow down and try again.", code: "rate_limited" },
      {
        status: 429,
        headers: {
          "Retry-After": String(result.retryAfterSeconds),
          "Cache-Control": "no-store",
        },
      },
    );
  }

  if (isAccessTokenRequired() && !PUBLIC_API_PATHS.has(pathname)) {
    const token = accessTokenFromHeaders(req.headers);
    if (!(await verifyAccessToken(token))) {
      return NextResponse.json(
        { error: "Unauthorized. Provide a valid JARVIS access token.", code: "unauthorized" },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": "Bearer",
            "Cache-Control": "no-store",
          },
        },
      );
    }
  }

  const response = NextResponse.next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
