import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/sentry/scrub-pii";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

// G-PERF-1: Replay integration removed for initial-load performance.
// Loading replayIntegration() shipped ~200 KB of session-recording client code
// on every page even with replaysSessionSampleRate=0. Error capture, breadcrumbs,
// and traces still work via the default integrations. Re-add post-launch if
// user-session debugging becomes necessary.
Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment:
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    process.env.NODE_ENV,
  tracesSampleRate: 0.1,
  // H10: defensive PII denylist scrubber (phone/email/OTP/manage_token).
  beforeSend: scrubEvent,
});
