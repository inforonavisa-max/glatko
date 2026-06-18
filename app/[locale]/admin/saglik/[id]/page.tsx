import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { getProviderDetail } from "@/lib/saglik/admin";
import type { Locale } from "@/i18n/routing";
import type { ProviderVerificationStatus } from "@/lib/saglik/admin";
import { HealthProviderActions } from "../HealthProviderActions";
import { HealthProviderManagement } from "../HealthProviderManagement";
import { HealthLicenseViewer } from "../HealthLicenseViewer";

type Props = {
  params: Promise<{ locale: string; id: string }> | { locale: string; id: string };
};

const STATUS_STYLES: Record<ProviderVerificationStatus, string> = {
  pending:
    "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-900/20 dark:text-yellow-300",
  approved:
    "border-green-200 bg-green-50 text-green-700 dark:border-green-500/30 dark:bg-green-900/20 dark:text-green-300",
  rejected:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-300",
};

const STATUS_KEYS: Record<ProviderVerificationStatus, string> = {
  pending: "admin.health.statusPending",
  approved: "admin.health.statusApproved",
  rejected: "admin.health.statusRejected",
};

// 0 = Monday … 6 = Sunday (DB convention). Labels TODO i18n (hardcoded TR operational).
const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

export default async function HealthProviderDetailPage({ params }: Props) {
  const { locale, id } = await Promise.resolve(params);
  setRequestLocale(locale);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminEmail(user?.email)) notFound();

  const t = await getTranslations();
  const provider = await getProviderDetail(id, locale as Locale);
  if (!provider) notFound();

  const displayName = `${provider.title ? `${provider.title} ` : ""}${provider.fullName}`.trim();
  const bioText = provider.bio[locale] ?? provider.bio.en ?? Object.values(provider.bio)[0] ?? null;

  return (
    <div>
      <Link
        href={`/${locale}/admin/saglik`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("common.back")}
      </Link>

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold text-gray-900 dark:text-white md:text-3xl">
            {displayName}
          </h1>
          <div className="mt-1 h-0.5 w-12 rounded-full bg-gradient-to-r from-brandHealth to-brandHealth-700" />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-medium ${STATUS_STYLES[provider.verificationStatus]}`}
            >
              {t(STATUS_KEYS[provider.verificationStatus])}
            </span>
            {provider.isPublished && (
              <span className="inline-flex rounded-full border border-brandHealth/30 bg-brandHealth-50 px-3 py-1 text-xs font-medium text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth">
                {t("admin.health.live")}
              </span>
            )}
            <span className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium capitalize text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70">
              {provider.subscriptionTier}
            </span>
          </div>
        </div>
      </div>

      {provider.verificationStatus === "rejected" && provider.rejectionReason && (
        <div className="mt-6 rounded-2xl border border-red-300/60 bg-red-50 px-5 py-4 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/[0.08] dark:text-red-300">
          <span className="font-semibold">{t("admin.health.rejectionReason")}:</span>{" "}
          {provider.rejectionReason}
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {/* Left: profile info (2 cols) */}
        <div className="space-y-6 md:col-span-2">
          <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
            <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
              {t("admin.health.profileInfo")}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label={t("admin.health.providerType")} value={provider.providerType} />
              <InfoItem label={t("admin.health.title")} value={provider.title} />
              <InfoItem
                label={t("admin.health.languages")}
                value={provider.languages.length > 0 ? provider.languages.join(", ") : null}
              />
              <InfoItem label={t("admin.health.licenseNumber")} value={provider.licenseNumber} />
              <InfoItem label={t("admin.health.chamber")} value={provider.chamber} />
              <InfoItem label={t("admin.health.slug")} value={provider.slug} />
            </dl>

            {bioText && (
              <div className="mt-6">
                <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
                  {t("admin.health.bio")}
                </dt>
                <dd className="mt-1 whitespace-pre-line text-sm text-gray-700 dark:text-white/80">
                  {bioText}
                </dd>
              </div>
            )}
          </section>

          {/* Specialties */}
          {provider.specialties.length > 0 && (
            <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
              <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.health.specialties")}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {provider.specialties.map((s) => (
                  <li
                    key={s.slug}
                    className="rounded-full border border-brandHealth/30 bg-brandHealth-50 px-3 py-1.5 text-sm text-brandHealth-700 dark:bg-brandHealth/10 dark:text-brandHealth"
                  >
                    {s.name ?? s.slug}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Locations */}
          {provider.locations.length > 0 && (
            <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
              <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.health.locations")}
              </h2>
              <ul className="mt-4 space-y-3">
                {provider.locations.map((l) => (
                  <li
                    key={l.id}
                    className="rounded-xl border border-gray-100/80 bg-white/40 p-3 dark:border-white/[0.06] dark:bg-white/[0.02]"
                  >
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{l.label}</p>
                    <p className="text-xs text-gray-500 dark:text-white/50">
                      {l.address}, {l.city}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Services */}
          {provider.services.length > 0 && (
            <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
              <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.health.services")}
              </h2>
              <ul className="mt-4 divide-y divide-gray-100 dark:divide-white/[0.06]">
                {provider.services.map((sv) => {
                  const svcName =
                    sv.name[locale] ?? sv.name.en ?? Object.values(sv.name)[0] ?? sv.id;
                  return (
                    <li key={sv.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {svcName}
                          {!sv.isActive && (
                            <span className="ml-2 text-xs text-gray-400">
                              ({t("admin.health.inactive")})
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-white/50">
                          {sv.durationMin} {t("admin.health.minutes")} · {sv.mode}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-white/80">
                        {sv.priceEur != null ? `${sv.priceEur} EUR` : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Weekly schedule */}
          {provider.schedules.length > 0 && (
            <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03] md:p-8">
              <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
                {t("admin.health.schedule")}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {provider.schedules.map((sc) => (
                  <li
                    key={sc.id}
                    className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-1.5 text-xs text-gray-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-white/70"
                  >
                    <span className="font-medium">{WEEKDAY_LABELS[sc.weekday] ?? sc.weekday}</span>{" "}
                    {sc.startTime}–{sc.endTime}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right: license + actions + management (1 col) */}
        <div className="space-y-6">
          <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="font-serif text-lg font-semibold text-gray-900 dark:text-white">
              {t("admin.health.licenseDocument")}
            </h2>
            <div className="mt-4">
              <HealthLicenseViewer providerId={provider.providerId} licenseFileSet={provider.licenseFileSet} />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-200/50 bg-white/70 p-6 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.03]">
            <h2 className="mb-4 font-serif text-lg font-semibold text-gray-900 dark:text-white">
              {t("admin.health.decision")}
            </h2>
            <HealthProviderActions
              providerId={provider.providerId}
              currentStatus={provider.verificationStatus}
            />
          </section>

          <HealthProviderManagement
            providerId={provider.providerId}
            isPublished={provider.isPublished}
            isApproved={provider.verificationStatus === "approved"}
            currentTier={provider.subscriptionTier}
          />
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-xl border border-gray-100/80 bg-white/40 p-3 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-white/50">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium capitalize text-gray-900 dark:text-white">
        {value ?? "—"}
      </dd>
    </div>
  );
}
