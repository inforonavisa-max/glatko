import "server-only";

import { createHash } from "crypto";
import { Redis } from "@upstash/redis/cloudflare";
import { Ratelimit } from "@upstash/ratelimit";

/**
 * Glatko Kariyer — rate limiting for the express-interest surface and the worker
 * phone-OTP flow. CLONED from lib/saglik/otp-rate-limit.ts: the SAME Upstash
 * sliding-window mechanism (salted SHA-256 identifiers, FAIL-OPEN on any Redis
 * error / missing config) — only the buckets are career-scoped so they never
 * collide with the health or auth limiters.
 *
 * Two independent limiter pairs, each per-key + per-IP:
 *   * career-interest (prefix glatko:career-interest) — caps how fast one employer
 *     account / IP can fire express-interest gate rows (anti-scrape on the gate;
 *     RULE R12 notes the pool browse page-route itself is unthrottled by the /api
 *     cap, so the interest WRITE is where we throttle hardest).
 *   * career-otp (prefix glatko:career-otp) — caps worker phone-OTP issuance per
 *     phone + per IP, exactly like health's guest OTP gate.
 *
 * Guest/employer flows → keyed on the supplied key (employer account id or E.164
 * phone) and the client IP. FAIL-OPEN everywhere: an Upstash outage never blocks a
 * legitimate interest/OTP.
 */

const SALT = process.env.RATE_LIMIT_SALT || "dev-no-salt";

const INTEREST_PREFIX = "glatko:career-interest";
const OTP_PREFIX = "glatko:career-otp";

// Interest: tighter than OTP — the gate write is the abuse-magnet surface.
const INTEREST_PER_KEY_PER_HOUR = 20;
const INTEREST_PER_IP_PER_HOUR = 40;

// OTP: mirror health's per-phone 3/h + per-IP 10/h ceilings.
const OTP_PER_PHONE_PER_HOUR = 3;
const OTP_PER_IP_PER_HOUR = 10;

let cachedRedis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (cachedRedis !== undefined) return cachedRedis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  cachedRedis = url && token ? new Redis({ url, token }) : null;
  return cachedRedis;
}

function makeLimiter(limit: number, prefix: string): Ratelimit | null {
  const redis = getRedis();
  return redis
    ? new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(limit, "1 h"),
        analytics: false,
        prefix,
      })
    : null;
}

// Lazily-built, cached limiter instances (undefined = not yet built).
let interestKeyLimiter: Ratelimit | null | undefined;
let interestIpLimiter: Ratelimit | null | undefined;
let otpPhoneLimiter: Ratelimit | null | undefined;
let otpIpLimiter: Ratelimit | null | undefined;

function getInterestKeyLimiter(): Ratelimit | null {
  if (interestKeyLimiter === undefined) {
    interestKeyLimiter = makeLimiter(INTEREST_PER_KEY_PER_HOUR, `${INTEREST_PREFIX}:key`);
  }
  return interestKeyLimiter;
}
function getInterestIpLimiter(): Ratelimit | null {
  if (interestIpLimiter === undefined) {
    interestIpLimiter = makeLimiter(INTEREST_PER_IP_PER_HOUR, `${INTEREST_PREFIX}:ip`);
  }
  return interestIpLimiter;
}
function getOtpPhoneLimiter(): Ratelimit | null {
  if (otpPhoneLimiter === undefined) {
    otpPhoneLimiter = makeLimiter(OTP_PER_PHONE_PER_HOUR, `${OTP_PREFIX}:phone`);
  }
  return otpPhoneLimiter;
}
function getOtpIpLimiter(): Ratelimit | null {
  if (otpIpLimiter === undefined) {
    otpIpLimiter = makeLimiter(OTP_PER_IP_PER_HOUR, `${OTP_PREFIX}:ip`);
  }
  return otpIpLimiter;
}

function hashKey(value: string): string {
  return createHash("sha256").update(`${value}:${SALT}`).digest("hex");
}

export type CareerLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "key_hourly" | "ip_hourly" };

/**
 * Consumes the per-employer-key and per-IP express-interest windows. `employerKey`
 * is the employer account id (or any stable per-employer identifier). FAIL-OPEN on
 * any error or when Upstash is unconfigured (local dev).
 */
export async function checkCareerInterestLimit(
  employerKey: string,
  ip: string,
): Promise<CareerLimitResult> {
  const keyLimiter = getInterestKeyLimiter();
  if (keyLimiter && employerKey) {
    try {
      const { success } = await keyLimiter.limit(hashKey(`k:${employerKey}`));
      if (!success) return { allowed: false, reason: "key_hourly" };
    } catch (err) {
      console.warn(
        "[career-interest] per-key limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const ipLimiter = getInterestIpLimiter();
  if (ipLimiter && ip && ip !== "unknown") {
    try {
      const { success } = await ipLimiter.limit(hashKey(`i:${ip}`));
      if (!success) return { allowed: false, reason: "ip_hourly" };
    } catch (err) {
      console.warn(
        "[career-interest] per-ip limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { allowed: true };
}

export type CareerOtpLimitResult =
  | { allowed: true }
  | { allowed: false; reason: "phone_hourly" | "ip_hourly" };

/**
 * Consumes the per-phone and per-IP worker-OTP windows. FAIL-OPEN on any error or
 * when Upstash is unconfigured (local dev) so an outage never blocks a legit signup.
 */
export async function checkCareerOtpLimit(
  e164Phone: string,
  ip: string,
): Promise<CareerOtpLimitResult> {
  const phoneLimiter = getOtpPhoneLimiter();
  if (phoneLimiter && e164Phone) {
    try {
      const { success } = await phoneLimiter.limit(hashKey(`p:${e164Phone}`));
      if (!success) return { allowed: false, reason: "phone_hourly" };
    } catch (err) {
      console.warn(
        "[career-otp] per-phone limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  const ipLimiter = getOtpIpLimiter();
  if (ipLimiter && ip && ip !== "unknown") {
    try {
      const { success } = await ipLimiter.limit(hashKey(`i:${ip}`));
      if (!success) return { allowed: false, reason: "ip_hourly" };
    } catch (err) {
      console.warn(
        "[career-otp] per-ip limiter failed; allowing (fail-open)",
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { allowed: true };
}
