/**
 * G-AUTH-3: Factory that maps a Supabase Auth Hook payload to a rendered
 * email template (subject + React element + plain-text fallback).
 *
 * Locale resolution: `email_hook/route.ts` decides the locale from
 * `user.user_metadata.preferred_locale` and passes it in here. We accept
 * any string and fall back to `me` (Glatko default market).
 */
import type { ReactElement } from "react";
import React from "react";
import { getSiteUrl } from "@/lib/email/resend";
import AuthEmail from "@/lib/email/templates/auth/auth-email";
import {
  getAuthEmailCommon,
  getAuthEmailCopy,
  type AuthEmailType,
} from "@/lib/email/templates/auth-translations";
import {
  coerceEmailLocale,
  getEmailStrings,
  type EmailLocale,
} from "@/lib/email/templates/translations";

export type AuthHookUser = {
  id: string;
  email: string;
  /**
   * Pending new email during an email_change. GoTrue serializes the EmailChange
   * field here (mirrors new_phone on the SMS hook). Present when a phone-only
   * account adds its first email; the confirmation goes to this address.
   */
  new_email?: string;
  user_metadata?: {
    preferred_locale?: string;
    first_name?: string;
    full_name?: string;
    name?: string;
    [key: string]: unknown;
  };
};

export type AuthHookEmailData = {
  token: string;
  token_hash: string;
  redirect_to?: string;
  email_action_type: string;
  site_url?: string;
};

export type BuildAuthEmailInput = {
  user: AuthHookUser;
  emailData: AuthHookEmailData;
  locale: EmailLocale;
};

export type BuiltAuthEmail = {
  subject: string;
  react: ReactElement;
  text: string;
  /** The resolved email_action_type (so the route can tag analytics). */
  type: AuthEmailType;
  /** One-click unsubscribe URL (List-Unsubscribe header + plain-text footer). */
  unsubscribeUrl: string;
};

const SUPPORTED_TYPES: readonly AuthEmailType[] = [
  "recovery",
  "signup",
  "magiclink",
  "email_change",
  "reauthentication",
];

function isSupportedType(value: string): value is AuthEmailType {
  return (SUPPORTED_TYPES as readonly string[]).includes(value);
}

function getFirstName(user: AuthHookUser): string {
  const meta = user.user_metadata ?? {};
  if (typeof meta.first_name === "string" && meta.first_name.trim()) {
    return meta.first_name.trim();
  }
  const fullName =
    (typeof meta.full_name === "string" && meta.full_name) ||
    (typeof meta.name === "string" && meta.name) ||
    "";
  if (fullName.trim()) {
    return fullName.trim().split(/\s+/)[0];
  }
  // Fallback: local part of the email — or the new email for a first-time
  // email_change on a phone-only account (current email is empty) — trimmed.
  const localPart = (user.email || user.new_email || "").split("@")[0] ?? "";
  return localPart.split(/[._\-+]/)[0] || "";
}

/**
 * Map our AuthEmailType to the Supabase verifyOtp `type` parameter that
 * /auth/confirm will use. Reauth has no token_hash redeem path — its CTA
 * just opens the app, so we never call this for it.
 */
function verifyOtpTypeFor(type: AuthEmailType): string {
  switch (type) {
    case "recovery":
      return "recovery";
    case "signup":
      return "signup";
    case "magiclink":
      return "magiclink";
    case "email_change":
      return "email_change";
    case "reauthentication":
      return "email"; // unused — see above
  }
}

function buildConfirmationUrl(
  emailData: AuthHookEmailData,
  type: AuthEmailType,
): string {
  const base = getSiteUrl();
  if (type === "reauthentication") {
    return base; // Reauth: user types code in-app; CTA just deep-links home.
  }
  const url = new URL("/auth/confirm", base);
  url.searchParams.set("token_hash", emailData.token_hash);
  url.searchParams.set("type", verifyOtpTypeFor(type));
  if (emailData.redirect_to && emailData.redirect_to.startsWith("/")) {
    url.searchParams.set("next", emailData.redirect_to);
  }
  return url.toString();
}

function renderPlainText(parts: {
  companyName: string;
  tagline: string;
  heading: string;
  greeting: string;
  intro: string;
  code?: string;
  codeLabel?: string;
  cta: string;
  ctaUrl: string;
  expiry: string;
  ignoreNote: string;
  signature: string;
  footerHelp: string;
  footerCopyright: string;
  unsubscribeLabel: string;
  unsubscribeUrl: string;
}): string {
  // Rich plain-text fallback: even/dense divider lines balance the HTML/text
  // ratio (SpamAssassin lifts on text-heavy + HTML-heavy mixes), and clear
  // structure helps Apple Mail "View as plain text" mode and screen readers.
  const heavy = "═══════════════════════════════════════";
  const light = "──────────────────────────────────────";
  const lines = [
    heavy,
    parts.companyName.toUpperCase(),
    parts.tagline,
    heavy,
    "",
    parts.heading,
    "",
    parts.greeting,
    "",
    parts.intro,
    "",
    light,
    "",
  ];
  if (parts.code) {
    if (parts.codeLabel) lines.push(parts.codeLabel);
    lines.push(parts.code);
    lines.push("");
  }
  lines.push(`${parts.cta}:`);
  lines.push(parts.ctaUrl);
  lines.push("");
  lines.push(light);
  lines.push("");
  lines.push(parts.expiry);
  lines.push("");
  lines.push(parts.ignoreNote);
  lines.push("");
  lines.push(parts.signature);
  lines.push("");
  lines.push(heavy);
  lines.push(parts.footerHelp);
  lines.push("");
  lines.push(parts.footerCopyright);
  lines.push("");
  lines.push(`${parts.unsubscribeLabel}: ${parts.unsubscribeUrl}`);
  lines.push(heavy);
  return lines.join("\n").trim();
}

export function resolveLocale(raw: string | null | undefined): EmailLocale {
  // Glatko default market is Montenegro. Use `me` (not `en`) when the user
  // has no preferred locale recorded.
  if (!raw) return "me";
  return coerceEmailLocale(raw) === "en" && raw !== "en" ? "me" : coerceEmailLocale(raw);
}

export function buildAuthEmail(input: BuildAuthEmailInput): BuiltAuthEmail {
  const { user, emailData, locale } = input;

  if (!isSupportedType(emailData.email_action_type)) {
    throw new Error(
      `[GLATKO:auth-email] Unsupported email_action_type: ${emailData.email_action_type}`,
    );
  }
  const type = emailData.email_action_type;

  const copy = getAuthEmailCopy(locale, type);
  const common = getAuthEmailCommon(locale);
  const baseStrings = getEmailStrings(locale);
  const firstName = getFirstName(user);
  const code = emailData.token;

  // Substitute placeholders.
  const intro = copy.intro
    .replace("{firstName}", firstName)
    .replace("{code}", code);
  const greeting = `${baseStrings.greeting} ${firstName},`;

  const ctaUrl = buildConfirmationUrl(emailData, type);
  const showCode = type === "reauthentication";

  const react = React.createElement(AuthEmail, {
    locale,
    preheader: copy.preheader,
    heading: copy.heading,
    greeting,
    intro,
    cta: copy.cta,
    ctaUrl,
    code: showCode ? code : undefined,
    codeLabel: showCode ? common.codeLabel : undefined,
    expiry: copy.expiry,
    ignoreNote: copy.ignoreNote,
    signature: copy.signature,
  });

  const baseUrl = getSiteUrl();
  const unsubscribeUrl = `${baseUrl}/${locale}/email-preferences?token=${user.id}`;

  const text = renderPlainText({
    companyName: baseStrings.companyName,
    tagline: baseStrings.tagline,
    heading: copy.heading,
    greeting,
    intro,
    code: showCode ? code : undefined,
    codeLabel: showCode ? common.codeLabel : undefined,
    cta: copy.cta,
    ctaUrl,
    expiry: copy.expiry,
    ignoreNote: copy.ignoreNote,
    signature: copy.signature,
    footerHelp: baseStrings.viewOnPlatform,
    footerCopyright: baseStrings.footerCopyright.replace(
      "YEAR",
      String(new Date().getFullYear()),
    ),
    unsubscribeLabel: baseStrings.unsubscribeLabel,
    unsubscribeUrl,
  });

  return { subject: copy.subject, react, text, type, unsubscribeUrl };
}
