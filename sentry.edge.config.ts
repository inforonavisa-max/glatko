import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/scrub-pii";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // H10: defensive PII denylist scrubber (phone/email/OTP/manage_token).
  beforeSend: scrubEvent,
});
