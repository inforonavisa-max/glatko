import { createHash } from "crypto";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * SMS one-time-code rate limiting for the Sprint A phone-verification flow.
 *
 * Two independent sliding windows, deliberately checked at different layers so
 * a single OTP request never double-increments either bucket:
 *   • per-user 5/day   — account-level abuse gate, enforced in the server
 *                        action before triggering the OTP (scope "user").
 *   • per-phone 3/hour — protects one number from being hammered, enforced in
 *                        the Send SMS hook just before dispatch (scope "phone").
 *
 * Mirrors lib/rateLimit.ts: salted SHA-256 identifiers and fail-open on any
 * Redis error or missing config (a rate-limit outage must not block legit
 * verification). When Upstash is unconfigured (local dev) both limiters are
 * null and every request is allowed.
 */

const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || "dev-no-salt";

const PER_USER_PER_DAY = 5;
const PER_PHONE_PER_HOUR = 3;

const PREFIX = "glatko:sms-otp";

export type SmsOtpLimitScope = "user" | "phone" | "both";
export type SmsOtpLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "user_daily" | "phone_hourly" };

let cachedRedis: Redis | null | undefined;
let userLimiter: Ratelimit | null | undefined;
let phoneLimiter: Ratelimit | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

function getUserLimiter(): Ratelimit | null {
  if (userLimiter !== undefined) return userLimiter;
  const redis = getRedis();
  userLimiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(PER_USER_PER_DAY, "1 d"),
        analytics: false,
        prefix: `${PREFIX}:user`,
      })
    : null;
  return userLimiter;
}

function getPhoneLimiter(): Ratelimit | null {
  if (phoneLimiter !== undefined) return phoneLimiter;
  const redis = getRedis();
  phoneLimiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(PER_PHONE_PER_HOUR, "1 h"),
        analytics: false,
        prefix: `${PREFIX}:phone`,
      })
    : null;
  return phoneLimiter;
}

function hashKey(value: string): string {
  return createHash("sha256").update(`${value}:${RATE_LIMIT_SALT}`).digest("hex");
}

/**
 * Checks the SMS OTP limits. `scope` selects which window(s) to consume:
 *   • "user"  — action layer (per-user daily)
 *   • "phone" — hook layer (per-phone hourly)
 *   • "both"  — consume both (default; standalone callers)
 *
 * Returns `{ allowed: false, reason }` on the first exceeded window.
 */
export async function checkSmsOtpLimit(
  userId: string,
  e164Phone: string,
  scope: SmsOtpLimitScope = "both",
): Promise<SmsOtpLimitResult> {
  if (scope === "user" || scope === "both") {
    const limiter = getUserLimiter();
    if (limiter) {
      try {
        const { success } = await limiter.limit(hashKey(`u:${userId}`));
        if (!success) return { allowed: false, reason: "user_daily" };
      } catch (err) {
        console.warn(
          "[GLATKO:sms-otp] per-user limiter failed; allowing (fail-open)",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  if (scope === "phone" || scope === "both") {
    const limiter = getPhoneLimiter();
    if (limiter) {
      try {
        const { success } = await limiter.limit(hashKey(`p:${e164Phone}`));
        if (!success) return { allowed: false, reason: "phone_hourly" };
      } catch (err) {
        console.warn(
          "[GLATKO:sms-otp] per-phone limiter failed; allowing (fail-open)",
          err instanceof Error ? err.message : err,
        );
      }
    }
  }

  return { allowed: true };
}
