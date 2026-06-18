import * as Sentry from "@sentry/nextjs";

function sentryEnabled(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SENTRY_DSN &&
      process.env.NEXT_PUBLIC_SENTRY_DSN.length > 0,
  );
}

/** Best-effort error reporting; no-op when DSN unset (local dev). */
export function glatkoCaptureException(
  err: unknown,
  tags: Record<string, string>,
): void {
  if (!sentryEnabled()) return;
  Sentry.captureException(err, { tags });
}

/**
 * Best-effort message capture (non-error tripwires, e.g. the H3 Mapbox quota
 * 80% alarm). No-op when DSN unset. `level` follows Sentry severity levels.
 */
export function glatkoCaptureMessage(
  message: string,
  level: "info" | "warning" | "error",
  tags: Record<string, string>,
): void {
  if (!sentryEnabled()) return;
  Sentry.captureMessage(message, { level, tags });
}
