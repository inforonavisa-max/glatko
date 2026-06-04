import { createHash } from "crypto";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Per-user rate limit for the "add a backup email" flow (updateUser({ email })
 * → email_change confirmation mail). Prevents a logged-in phone-only user from
 * mail-bombing arbitrary addresses by spamming the add-email action.
 *
 * Mirrors lib/ratelimit/sms-otp-limit.ts: salted SHA-256 keys, fail-open on any
 * Redis error / missing config (a rate-limit outage must not block a legit
 * email add). Keyed on the authenticated user id (not the target email).
 */

const RATE_LIMIT_SALT = process.env.RATE_LIMIT_SALT || "dev-no-salt";

const PER_USER_PER_HOUR = 3;
const PER_USER_PER_DAY = 5;

const PREFIX = "glatko:email-add";

export type EmailAddLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "hourly" | "daily" };

let cachedRedis: Redis | null | undefined;
let hourLimiter: Ratelimit | null | undefined;
let dayLimiter: Ratelimit | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

function getHourLimiter(): Ratelimit | null {
  if (hourLimiter !== undefined) return hourLimiter;
  const redis = getRedis();
  hourLimiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(PER_USER_PER_HOUR, "1 h"),
        analytics: false,
        prefix: `${PREFIX}:hour`,
      })
    : null;
  return hourLimiter;
}

function getDayLimiter(): Ratelimit | null {
  if (dayLimiter !== undefined) return dayLimiter;
  const redis = getRedis();
  dayLimiter = redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(PER_USER_PER_DAY, "1 d"),
        analytics: false,
        prefix: `${PREFIX}:day`,
      })
    : null;
  return dayLimiter;
}

function hashKey(value: string): string {
  return createHash("sha256").update(`${value}:${RATE_LIMIT_SALT}`).digest("hex");
}

export async function checkEmailAddLimit(
  userId: string,
): Promise<EmailAddLimitResult> {
  const hour = getHourLimiter();
  if (hour) {
    try {
      const { success } = await hour.limit(hashKey(`h:${userId}`));
      if (!success) return { allowed: false, reason: "hourly" };
    } catch (err) {
      console.warn(
        "[GLATKO:email-add] per-hour limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const day = getDayLimiter();
  if (day) {
    try {
      const { success } = await day.limit(hashKey(`d:${userId}`));
      if (!success) return { allowed: false, reason: "daily" };
    } catch (err) {
      console.warn(
        "[GLATKO:email-add] per-day limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { allowed: true };
}
