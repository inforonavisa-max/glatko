"use client";

import {
  Briefcase,
  FileText,
  Image as ImageIcon,
  MapPin,
  ShieldCheck,
  User,
  Wallet,
} from "lucide-react";
import { ProfileCompletionGauge } from "@/components/glatko/pro-dashboard/ProfileCompletionGauge";

interface CategorySummary {
  slug: string;
  name: string;
  isPrimary: boolean;
}

interface Props {
  businessName: string;
  bio: string;
  city: string;
  languages: string[];
  experience: string;
  selectedCategories: CategorySummary[];
  applicationAnswerCount: number;
  portfolioCount: number;
  documentsCount: number;
  pricingType: string;
  pricingBaseRate: string;
  completionScore: number;
  missingFields: string[];
  t: (key: string) => string;
}

/**
 * G-PRO-1 Faz 4 — Final review step. Renders a snapshot of all wizard
 * inputs grouped into 5 cards + the completion gauge. Submit button
 * lives in the parent wizard. After successful submit, the wizard shows
 * its own success page.
 */
export function StepReview({
  businessName,
  bio,
  city,
  languages,
  experience,
  selectedCategories,
  applicationAnswerCount,
  portfolioCount,
  documentsCount,
  pricingType,
  pricingBaseRate,
  completionScore,
  missingFields,
  t,
}: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-lg font-semibold text-gray-900 dark:text-white">
          {t("becomePro.steps.review")}
        </h2>
        <p className="text-sm text-gray-500 dark:text-white/50">
          {t("becomePro.review.subtitle")}
        </p>
      </div>

      <ProfileCompletionGauge
        score={completionScore}
        missing={missingFields}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <SummaryCard
          icon={User}
          title={t("becomePro.review.personalInfo")}
          rows={[
            {
              label: t("becomePro.review.businessName"),
              value: businessName || t("becomePro.review.notSet"),
            },
            {
              label: t("becomePro.review.city"),
              value: city || t("becomePro.review.notSet"),
            },
            {
              label: t("becomePro.review.experience"),
              value: experience
                ? `${experience} ${t("becomePro.review.years")}`
                : t("becomePro.review.notSet"),
            },
            {
              label: t("becomePro.review.languages"),
              value:
                languages.length > 0
                  ? languages.map((l) => l.toUpperCase()).join(", ")
                  : t("becomePro.review.notSet"),
            },
          ]}
          fullText={
            bio.trim().length > 0
              ? { label: t("becomePro.review.bio"), value: bio }
              : undefined
          }
        />

        <SummaryCard
          icon={Briefcase}
          title={t("becomePro.review.servicesTitle")}
          rows={selectedCategories.map((c) => ({
            label: c.isPrimary
              ? `★ ${c.name}`
              : c.name,
            value: c.isPrimary ? t("becomePro.review.primary") : "",
          }))}
        />

        <SummaryCard
          icon={MapPin}
          title={t("becomePro.review.applicationQuestionsTitle")}
          rows={[
            {
              label: t("becomePro.review.answersCount"),
              value: String(applicationAnswerCount),
            },
          ]}
        />

        <SummaryCard
          icon={ImageIcon}
          title={t("becomePro.review.portfolioTitle")}
          rows={[
            {
              label: t("becomePro.review.imagesCount"),
              value: String(portfolioCount),
            },
          ]}
        />

        <SummaryCard
          icon={Wallet}
          title={t("becomePro.review.pricingTitle")}
          rows={[
            {
              label: t(`becomePro.portfolio.pricingType.${pricingType}`),
              value:
                pricingBaseRate.trim().length > 0
                  ? `€${pricingBaseRate}`
                  : t("becomePro.review.notSet"),
            },
          ]}
        />

        <SummaryCard
          icon={ShieldCheck}
          title={t("becomePro.review.documentsTitle")}
          rows={[
            {
              label: t("becomePro.review.documentsCount"),
              value: String(documentsCount),
            },
          ]}
        />
      </div>

      <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-3 text-sm text-teal-700 dark:text-teal-300">
        {t("becomePro.review.moderationNotice")}
      </div>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  title,
  rows,
  fullText,
}: {
  icon: typeof FileText;
  title: string;
  rows: Array<{ label: string; value: string }>;
  fullText?: { label: string; value: string };
}) {
  return (
    <div className="rounded-2xl border border-gray-100/80 bg-white/40 p-5 backdrop-blur-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      <div className="mb-3 flex items-center gap-2">
        <Icon
          className="h-4 w-4 text-teal-600 dark:text-teal-400"
          aria-hidden
        />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {title}
        </h3>
      </div>
      <dl className="space-y-1.5 text-xs">
        {rows.length === 0 ? (
          <div className="text-gray-400 dark:text-white/30">—</div>
        ) : (
          rows.map((r, i) => (
            <div key={`${r.label}-${i}`} className="flex justify-between gap-2">
              <dt className="text-gray-500 dark:text-white/45">{r.label}</dt>
              <dd className="truncate text-right text-gray-900 dark:text-white">
                {r.value}
              </dd>
            </div>
          ))
        )}
      </dl>
      {fullText && (
        <div className="mt-3 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
          <p className="text-[11px] font-medium text-gray-500 dark:text-white/45">
            {fullText.label}
          </p>
          <p className="mt-1 line-clamp-3 text-xs text-gray-700 dark:text-white/70">
            {fullText.value}
          </p>
        </div>
      )}
    </div>
  );
}
