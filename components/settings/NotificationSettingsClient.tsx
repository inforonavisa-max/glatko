"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { motion } from "framer-motion";
import { Bell, Mail, Smartphone, MessageCircle, Check, Phone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { PageBackground } from "@/components/ui/PageBackground";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { GlassmorphCard } from "@/components/ui/GlassmorphCard";
import { cn } from "@/lib/utils";
import type { NotificationEmailPrefKey } from "@/lib/notifications/prefs";
import type { NormalizedNotificationPrefs } from "@/lib/notifications/prefs";
import {
  updateNotificationPreference,
  updateNotificationChannel,
} from "@/lib/actions/profile";

type RowDef = {
  prefKey: NotificationEmailPrefKey;
  labelKey:
    | "customer.newBid"
    | "customer.bidUpdates"
    | "customer.messages"
    | "customer.statusChange"
    | "customer.reviews"
    | "pro.newMatch"
    | "pro.bidUpdates"
    | "pro.messages"
    | "pro.reviews"
    | "pro.verification";
};

const CUSTOMER_ROWS: RowDef[] = [
  { prefKey: "email_new_bid", labelKey: "customer.newBid" },
  { prefKey: "email_customer_bid_events", labelKey: "customer.bidUpdates" },
  { prefKey: "email_new_message", labelKey: "customer.messages" },
  { prefKey: "email_status_change", labelKey: "customer.statusChange" },
  { prefKey: "email_new_review", labelKey: "customer.reviews" },
];

const PRO_ROWS: RowDef[] = [
  { prefKey: "email_new_request_match", labelKey: "pro.newMatch" },
  { prefKey: "email_pro_bid_outcome", labelKey: "pro.bidUpdates" },
  { prefKey: "email_new_message", labelKey: "pro.messages" },
  { prefKey: "email_new_review", labelKey: "pro.reviews" },
  { prefKey: "email_verification", labelKey: "pro.verification" },
];

export function NotificationSettingsClient({
  initialPrefs,
  isPro,
  hasPhone,
  initialChannel,
  initialOptIn,
}: {
  initialPrefs: NormalizedNotificationPrefs;
  isPro: boolean;
  hasPhone: boolean;
  initialChannel: "whatsapp" | "viber" | null;
  initialOptIn: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [prefs, setPrefs] = useState<NormalizedNotificationPrefs>(initialPrefs);

  useEffect(() => {
    setPrefs(initialPrefs);
  }, [initialPrefs]);

  const persist = useCallback(
    (key: NotificationEmailPrefKey, enabled: boolean) => {
      let previousEnabled = false;
      setPrefs((p) => {
        previousEnabled = p[key];
        return { ...p, [key]: enabled };
      });

      startTransition(async () => {
        const res = await updateNotificationPreference("email", key, enabled);
        if ("error" in res) {
          setPrefs((p) => ({ ...p, [key]: previousEnabled }));
          toast.error(t("saveError"));
          return;
        }
        router.refresh();
      });
    },
    [router, t],
  );

  return (
    <PageBackground>
      <div className="mx-auto max-w-3xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
        <SectionTitle>{t("title")}</SectionTitle>
        <p className="mt-2 text-sm text-gray-500 dark:text-white/45">
          {t("subtitle")}
        </p>

        <div className="mt-8 space-y-8">
          <ChannelSection
            initialChannel={initialChannel}
            initialOptIn={initialOptIn}
            hasPhone={hasPhone}
            t={t}
          />

          <PrefsTable
            title={t("customerSection")}
            rows={CUSTOMER_ROWS}
            prefs={prefs}
            onToggle={persist}
            disabled={pending}
            t={t}
          />

          {isPro ? (
            <PrefsTable
              title={t("proSection")}
              rows={PRO_ROWS}
              prefs={prefs}
              onToggle={persist}
              disabled={pending}
              t={t}
            />
          ) : null}
        </div>
      </div>
    </PageBackground>
  );
}

function ChannelSection({
  initialChannel,
  initialOptIn,
  hasPhone,
  t,
}: {
  initialChannel: "whatsapp" | "viber" | null;
  initialOptIn: boolean;
  hasPhone: boolean;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  const tOptIn = useTranslations("messagingOptIn");
  const router = useRouter();
  const [channel, setChannel] = useState<"whatsapp" | "viber" | null>(
    initialChannel,
  );
  const [optIn, setOptIn] = useState(initialOptIn);
  // A messaging channel the user picked that still needs the consent tick before
  // it persists. null = nothing pending.
  const [pendingChannel, setPendingChannel] = useState<
    "whatsapp" | "viber" | null
  >(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, startSaving] = useTransition();

  useEffect(() => {
    setChannel(initialChannel);
  }, [initialChannel]);
  useEffect(() => {
    setOptIn(initialOptIn);
  }, [initialOptIn]);

  const enable = useCallback(
    (ch: "whatsapp" | "viber") => {
      startSaving(async () => {
        const res = await updateNotificationChannel(ch, true);
        if ("error" in res) {
          setPendingChannel(null);
          setConsentChecked(false);
          toast.error(
            res.error === "no_phone" ? t("channelNeedsPhone") : t("saveError"),
          );
          return;
        }
        setChannel(ch);
        setOptIn(true);
        setPendingChannel(null);
        toast.success(t("channelSaved"));
        router.refresh();
      });
    },
    [router, t],
  );

  const revoke = useCallback(() => {
    startSaving(async () => {
      const res = await updateNotificationChannel(null);
      if ("error" in res) {
        toast.error(t("saveError"));
        return;
      }
      setChannel(null);
      setOptIn(false);
      setPendingChannel(null);
      setConsentChecked(false);
      toast.success(t("channelSaved"));
      router.refresh();
    });
  }, [router, t]);

  const onSelect = useCallback(
    (value: "whatsapp" | "viber" | "off") => {
      if (value === "off") {
        setPendingChannel(null);
        setConsentChecked(false);
        if (!optIn) return; // already off
        revoke();
        return;
      }
      if (optIn && channel === value) {
        setPendingChannel(null); // already enabled on this channel
        return;
      }
      // Enabling (or switching to) a messaging channel: reveal consent, require tick.
      setPendingChannel(value);
      setConsentChecked(false);
    },
    [optIn, channel, revoke],
  );

  const onConsentToggle = useCallback(
    (checked: boolean) => {
      setConsentChecked(checked);
      if (checked && pendingChannel) {
        enable(pendingChannel);
      }
    },
    [pendingChannel, enable],
  );

  const selectedRadio: "whatsapp" | "viber" | "off" =
    pendingChannel ?? (optIn && channel ? channel : "off");
  const showConsent = selectedRadio === "whatsapp" || selectedRadio === "viber";
  const consentChannel = pendingChannel ?? channel;
  const channelLabel =
    consentChannel === "whatsapp"
      ? "WhatsApp"
      : consentChannel === "viber"
        ? "Viber"
        : tOptIn("channelBoth");
  // Pending → user-controlled checkbox; otherwise reflect the persisted opt-in
  // (checked + read-only; revoke happens via the "email only" option).
  const boxChecked = pendingChannel ? consentChecked : optIn;
  const boxInteractive = pendingChannel !== null;

  const messagingOptions = [
    { value: "whatsapp" as const, label: "WhatsApp" },
    { value: "viber" as const, label: "Viber" },
  ];

  const offActive = selectedRadio === "off";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <GlassmorphCard hover={false} className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <MessageCircle className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-serif text-base font-semibold text-gray-900 dark:text-white">
            {t("channelSection")}
          </h2>
        </div>

        <div className="px-5 py-4">
          <p className="text-sm text-gray-500 dark:text-white/45">
            {t("channelDesc")}
          </p>

          {hasPhone ? (
            <>
              <div
                role="radiogroup"
                aria-label={t("channelSection")}
                className="mt-4 space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  {messagingOptions.map((opt) => {
                    const active = selectedRadio === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={saving}
                        onClick={() => onSelect(opt.value)}
                        className={cn(
                          "relative flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                          active
                            ? "border-teal-500 bg-teal-50/60 text-teal-700 ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-teal-500/10 dark:text-teal-300"
                            : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/20",
                        )}
                      >
                        {active && (
                          <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-white">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={offActive}
                  disabled={saving}
                  onClick={() => onSelect("off")}
                  className={cn(
                    "relative flex w-full items-center justify-center rounded-xl border px-4 py-3 text-sm font-medium transition-all disabled:cursor-not-allowed disabled:opacity-60",
                    offActive
                      ? "border-teal-500 bg-teal-50/60 text-teal-700 ring-2 ring-teal-500/20 dark:border-teal-400 dark:bg-teal-500/10 dark:text-teal-300"
                      : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 dark:border-white/10 dark:bg-white/5 dark:text-white/80 dark:hover:border-white/20",
                  )}
                >
                  {offActive && (
                    <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-white">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                  )}
                  {tOptIn("channelOff")}
                </button>
              </div>

              {showConsent && (
                <div className="mt-4 rounded-xl border border-teal-200/70 bg-teal-50/50 px-4 py-3 dark:border-teal-500/20 dark:bg-teal-500/10">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={boxChecked}
                      disabled={!boxInteractive || saving}
                      onChange={(e) => onConsentToggle(e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-white/80">
                      {tOptIn("consentMain", { channel: channelLabel })}
                    </span>
                  </label>
                  <p className="mt-2 ps-7 text-xs text-gray-400 dark:text-white/40">
                    {tOptIn("legalNote")}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="mt-4 flex flex-col items-start gap-3 rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                <Phone className="h-4 w-4 shrink-0" aria-hidden />
                {t("channelNeedsPhone")}
              </p>
              <Link
                href="/settings/security"
                className="inline-flex items-center rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-teal-600"
              >
                {t("channelAddPhoneCta")}
              </Link>
            </div>
          )}
        </div>
      </GlassmorphCard>
    </motion.div>
  );
}

function PrefsTable({
  title,
  rows,
  prefs,
  onToggle,
  disabled,
  t,
}: {
  title: string;
  rows: RowDef[];
  prefs: NormalizedNotificationPrefs;
  onToggle: (key: NotificationEmailPrefKey, v: boolean) => void;
  disabled: boolean;
  t: (key: string, values?: Record<string, string>) => string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-full"
    >
      <div className="max-w-full overflow-x-auto [-webkit-overflow-scrolling:touch]">
        <GlassmorphCard
          hover={false}
          className="min-w-[min(100%,18rem)] overflow-hidden p-0 sm:min-w-0"
        >
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <Bell className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          <h2 className="font-serif text-base font-semibold text-gray-900 dark:text-white">
            {title}
          </h2>
        </div>

        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0 px-4 py-3 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-white/40 sm:px-5">
          <div className="pl-1">{t("columnNotification")}</div>
          <div className="flex w-14 justify-center sm:w-16">
            <span className="flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" aria-hidden />
              {t("columnEmail")}
            </span>
          </div>
          <div className="flex w-14 justify-center sm:w-16">
            <span className="flex items-center gap-1">
              <Smartphone className="h-3.5 w-3.5" aria-hidden />
              {t("columnPush")}
            </span>
          </div>
        </div>

        {rows.map((row) => (
          <div
            key={`${row.prefKey}-${row.labelKey}`}
            className={cn(
              "grid grid-cols-[1fr_auto_auto] items-center gap-x-3 border-t border-gray-100 px-4 py-3.5 sm:px-5 dark:border-white/[0.06]",
            )}
          >
            <p className="pr-2 text-sm font-medium text-gray-800 dark:text-white/85">
              {t(row.labelKey)}
            </p>
            <div className="flex w-14 justify-center sm:w-16">
              <Switch
                checked={prefs[row.prefKey]}
                onCheckedChange={(v) => onToggle(row.prefKey, v)}
                disabled={disabled}
                aria-label={t("emailToggleAria", {
                  label: t(row.labelKey),
                })}
              />
            </div>
            <div className="flex w-14 justify-center sm:w-16">
              <span
                className="inline-flex cursor-help opacity-40"
                title={t("pushComingSoon")}
              >
                <Switch
                  checked={false}
                  disabled
                  onCheckedChange={() => {}}
                  className="pointer-events-none"
                  aria-label={t("pushComingSoon")}
                />
              </span>
            </div>
          </div>
        ))}
        </GlassmorphCard>
      </div>
    </motion.div>
  );
}
