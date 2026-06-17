import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";
import { decideBotDecision, type BotDecision } from "@/lib/botDefense";

type RouteClass =
  | "exception"
  | "admin-sensitive"
  | "verified-bot"
  | "public-form"
  | "auth-sensitive"
  | "bot-suspicious"
  | "default";

type LimitPolicy = {
  routeClass: Exclude<RouteClass, "exception">;
  limit: number;
  window: `${number} ${"s" | "m" | "h" | "d"}`;
};

export const RATE_LIMIT_POLICIES: Record<LimitPolicy["routeClass"], Omit<LimitPolicy, "routeClass">> =
  {
    "admin-sensitive": { limit: 30, window: "1 m" },
    "verified-bot": { limit: 80, window: "1 m" },
    "public-form": { limit: 12, window: "1 m" },
    "auth-sensitive": { limit: 20, window: "1 m" },
    "bot-suspicious": { limit: 3, window: "1 m" },
    default: { limit: 200, window: "1 m" },
  };

const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || "dev-no-salt";
const ENV_PREFIX =
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  "unknown";
const DEPLOYMENT_NAMESPACE = (process.env.VERCEL_URL || "").toLowerCase();
const RATE_LIMIT_NAMESPACE = DEPLOYMENT_NAMESPACE ? `${ENV_PREFIX}:${DEPLOYMENT_NAMESPACE}` : ENV_PREFIX;

const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  upstashUrl && upstashToken ? new Redis({ url: upstashUrl, token: upstashToken }) : null;

const limiterByClass: Partial<Record<LimitPolicy["routeClass"], Ratelimit>> = redis
  ? {
      "admin-sensitive": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["admin-sensitive"].limit,
          RATE_LIMIT_POLICIES["admin-sensitive"].window,
        ),
        analytics: true,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:admin`,
      }),
      "public-form": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["public-form"].limit,
          RATE_LIMIT_POLICIES["public-form"].window,
        ),
        analytics: true,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:public-form`,
      }),
      "verified-bot": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["verified-bot"].limit,
          RATE_LIMIT_POLICIES["verified-bot"].window,
        ),
        analytics: true,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:verified-bot`,
      }),
      "auth-sensitive": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["auth-sensitive"].limit,
          RATE_LIMIT_POLICIES["auth-sensitive"].window,
        ),
        analytics: true,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:auth`,
      }),
      "bot-suspicious": new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES["bot-suspicious"].limit,
          RATE_LIMIT_POLICIES["bot-suspicious"].window,
        ),
        analytics: true,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:bot-suspicious`,
      }),
      default: new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(
          RATE_LIMIT_POLICIES.default.limit,
          RATE_LIMIT_POLICIES.default.window,
        ),
        analytics: false,
        prefix: `${RATE_LIMIT_NAMESPACE}:ratelimit:default`,
      }),
    }
  : {};

let warnedMissingRedis = false;
let warnedMissingCrypto = false;

function classifyRoute(pathname: string): RouteClass {
  if (
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    // Exact match: only the uptime healthcheck is exempt. Health-vertical
    // endpoints live under /api/health/* and MUST stay rate-limited.
    pathname === "/api/health"
  ) {
    return "exception";
  }

  if (pathname.startsWith("/api/cron/")) return "admin-sensitive";
  if (pathname.startsWith("/api/internal/")) return "admin-sensitive";
  if (pathname.startsWith("/api/admin")) return "admin-sensitive";
  if (pathname.startsWith("/admin")) return "exception";

  if (pathname.startsWith("/api/search")) return "public-form";
  if (pathname.startsWith("/api/map-assets")) return "public-form";
  // Health vertical public endpoints (H0 waitlist; later slots/holds/otp)
  if (pathname.startsWith("/api/health/")) return "public-form";
  // Career vertical public endpoints (C0 waitlist; later interest/unlocks/sign)
  if (pathname.startsWith("/api/career/")) return "public-form";

  if (pathname.startsWith("/login") || pathname.startsWith("/auth") || pathname.startsWith("/api/auth")) {
    return "auth-sensitive";
  }

  return "default";
}

function getClientIp(request: NextRequest): string {
  const direct = (request as unknown as Record<string, unknown>).ip as string | undefined;
  if (direct) return direct;

  const cf = request.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();

  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) return vercel.split(",")[0]?.trim() || "unknown";

  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || "unknown";

  return "unknown";
}

async function sha256Hex(input: string): Promise<string | null> {
  try {
    const cryptoObj = globalThis.crypto;
    if (!cryptoObj?.subtle) {
      if (!warnedMissingCrypto) {
        warnedMissingCrypto = true;
        console.warn("[rate-limit] crypto.subtle missing; falling back to shared 'unknown' identifier");
      }
      return null;
    }
    const enc = new TextEncoder();
    const buf = await cryptoObj.subtle.digest("SHA-256", enc.encode(input));
    const bytes = new Uint8Array(buf);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
  } catch {
    return null;
  }
}

function failOpenSignal(message: string, extra?: Record<string, unknown>) {
  console.warn(`[rate-limit] ${message}`, extra || "");
}

export function buildRateLimitResponse(
  routeClass: Exclude<RouteClass, "exception">,
  result: { limit: number; remaining: number; reset: number },
): NextResponse {
  const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
  const res = new NextResponse("Too Many Requests", { status: 429 });
  res.headers.set("Retry-After", String(retryAfterSeconds));
  res.headers.set("X-RateLimit-Limit", String(result.limit));
  res.headers.set("X-RateLimit-Remaining", String(result.remaining));
  res.headers.set("X-RateLimit-Reset", String(result.reset));
  res.headers.set("X-RateLimit-Class", routeClass);
  return res;
}

function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(en|ru|de|tr|sr|ar|me|uk|it)(\/.*)?$/);
  return match ? (match[2] || '/') : pathname;
}

export async function enforceRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const pathname = stripLocalePrefix(request.nextUrl.pathname);
  const baselineRouteClass = classifyRoute(pathname);
  if (baselineRouteClass === "exception") return null;

  if (!redis) {
    if (!warnedMissingRedis) {
      warnedMissingRedis = true;
      failOpenSignal("Upstash Redis not configured; rate limiting disabled (fail-open).", {
        env: ENV_PREFIX,
        namespace: RATE_LIMIT_NAMESPACE,
      });
    }
    return null;
  }

  const routeClassDecision: BotDecision = decideBotDecision({
    pathname,
    userAgent: request.headers.get("user-agent"),
    acceptLanguage: request.headers.get("accept-language"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    secFetchMode: request.headers.get("sec-fetch-mode"),
  });

  const routeClass: RouteClass = routeClassDecision.overrideRouteClass ?? baselineRouteClass;

  const ip = getClientIp(request);
  if (!ip) {
    failOpenSignal("IP hashing unavailable; rate limiting disabled for this request (fail-open).", {
      routeClass,
      pathname,
    });
    return null;
  }

  const ua = (request.headers.get("user-agent") ?? "").slice(0, 300);
  const identifier = await (async () => {
    if (routeClass === "verified-bot") {
      const uaHash = await sha256Hex(`${ua}:${RATE_LIMIT_SALT}`);
      return uaHash ? `bot:${uaHash}` : null;
    }
    if (routeClass === "bot-suspicious") {
      const sigHash = await sha256Hex(`${ip}\x00${ua}\x00${pathname}\x00${RATE_LIMIT_SALT}`);
      return sigHash ? `sig:${sigHash}` : null;
    }
    const ipHash = await sha256Hex(`${ip}:${RATE_LIMIT_SALT}`);
    return ipHash ? `ip:${ipHash}` : null;
  })();

  if (!identifier) {
    failOpenSignal("Identifier hashing unavailable; rate limiting disabled for this request (fail-open).", {
      routeClass,
      pathname,
    });
    return null;
  }

  const limiter = limiterByClass[routeClass] || limiterByClass.default;
  if (!limiter) return null;

  try {
    const result = await limiter.limit(`${routeClass}:${identifier}`);
    if (result.success) return null;
    return buildRateLimitResponse(routeClass, {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    });
  } catch (err) {
    failOpenSignal("Rate limit check failed; allowing request (fail-open).", {
      routeClass,
      pathname,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
