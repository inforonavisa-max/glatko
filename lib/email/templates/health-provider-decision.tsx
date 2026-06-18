import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/**
 * Glatko Sağlık — H8 provider verification decision email (approved / rejected).
 *
 * Sent best-effort (never-throw) by the H8 admin approve/reject server action after the
 * 079 decision RPC commits. Approved → "your profile is live"; rejected → the admin's
 * reason + a note that they can fix and resubmit. No PII in the body beyond the
 * provider's own display name. Mirrors the health-cancelled template structure.
 */

export type HealthProviderDecisionEmailProps = {
  locale: EmailLocale;
  providerName: string;
  decision: "approved" | "rejected";
  /** The admin's reason — only shown on rejection. */
  reason?: string | null;
  /** Public profile URL (approved) or onboarding URL (rejected, to fix & resubmit). */
  ctaUrl: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  reasonLabel: string;
  cta: string;
};

const COPY_APPROVED: Record<EmailLocale, Copy> = {
  tr: { preview: "Profiliniz onaylandı", headline: "Profiliniz onaylandı", intro: "Tebrikler! Sağlık sağlayıcı profiliniz onaylandı ve yayında. Hastalar artık sizden online randevu alabilir.", reasonLabel: "", cta: "Profilimi görüntüle" },
  en: { preview: "Your profile is approved", headline: "Your profile is approved", intro: "Congratulations! Your health provider profile has been approved and is now live. Patients can book appointments with you online.", reasonLabel: "", cta: "View my profile" },
  de: { preview: "Ihr Profil wurde freigegeben", headline: "Ihr Profil wurde freigegeben", intro: "Herzlichen Glückwunsch! Ihr Anbieterprofil wurde freigegeben und ist jetzt online. Patienten können online Termine bei Ihnen buchen.", reasonLabel: "", cta: "Mein Profil ansehen" },
  it: { preview: "Il tuo profilo è approvato", headline: "Il tuo profilo è approvato", intro: "Congratulazioni! Il tuo profilo professionale è stato approvato ed è ora online. I pazienti possono prenotare appuntamenti con te online.", reasonLabel: "", cta: "Vedi il mio profilo" },
  ru: { preview: "Ваш профиль одобрен", headline: "Ваш профиль одобрен", intro: "Поздравляем! Ваш профиль специалиста одобрен и опубликован. Пациенты теперь могут записываться к вам онлайн.", reasonLabel: "", cta: "Посмотреть мой профиль" },
  uk: { preview: "Ваш профіль схвалено", headline: "Ваш профіль схвалено", intro: "Вітаємо! Ваш профіль спеціаліста схвалено та опубліковано. Пацієнти тепер можуть записуватися до вас онлайн.", reasonLabel: "", cta: "Переглянути мій профіль" },
  sr: { preview: "Vaš profil je odobren", headline: "Vaš profil je odobren", intro: "Čestitamo! Vaš profil zdravstvenog pružaoca je odobren i sada je objavljen. Pacijenti mogu zakazati termine kod vas onlajn.", reasonLabel: "", cta: "Pogledaj moj profil" },
  me: { preview: "Vaš profil je odobren", headline: "Vaš profil je odobren", intro: "Čestitamo! Vaš profil zdravstvenog pružaoca je odobren i sada je objavljen. Pacijenti mogu zakazati termine kod vas onlajn.", reasonLabel: "", cta: "Pogledaj moj profil" },
  ar: { preview: "تمت الموافقة على ملفك", headline: "تمت الموافقة على ملفك", intro: "تهانينا! تمت الموافقة على ملفك كمقدم رعاية صحية وأصبح منشورًا الآن. يمكن للمرضى حجز المواعيد معك عبر الإنترنت.", reasonLabel: "", cta: "عرض ملفي" },
};

const COPY_REJECTED: Record<EmailLocale, Copy> = {
  tr: { preview: "Başvurunuz hakkında", headline: "Başvurunuz onaylanmadı", intro: "Sağlık sağlayıcı başvurunuz şu an onaylanmadı. Aşağıdaki nedeni inceleyip bilgilerinizi güncelleyerek tekrar gönderebilirsiniz.", reasonLabel: "Neden", cta: "Başvurumu düzenle" },
  en: { preview: "About your application", headline: "Your application was not approved", intro: "Your health provider application was not approved at this time. Please review the reason below, update your details, and resubmit.", reasonLabel: "Reason", cta: "Edit my application" },
  de: { preview: "Zu Ihrer Bewerbung", headline: "Ihre Bewerbung wurde nicht freigegeben", intro: "Ihre Bewerbung als Anbieter wurde derzeit nicht freigegeben. Bitte prüfen Sie den Grund unten, aktualisieren Sie Ihre Angaben und reichen Sie erneut ein.", reasonLabel: "Grund", cta: "Bewerbung bearbeiten" },
  it: { preview: "Riguardo alla tua candidatura", headline: "La tua candidatura non è stata approvata", intro: "La tua candidatura come professionista non è stata approvata per ora. Controlla il motivo qui sotto, aggiorna i dati e invia di nuovo.", reasonLabel: "Motivo", cta: "Modifica la candidatura" },
  ru: { preview: "О вашей заявке", headline: "Ваша заявка не одобрена", intro: "Ваша заявка как специалиста сейчас не одобрена. Пожалуйста, ознакомьтесь с причиной ниже, обновите данные и отправьте повторно.", reasonLabel: "Причина", cta: "Изменить заявку" },
  uk: { preview: "Про вашу заявку", headline: "Вашу заявку не схвалено", intro: "Вашу заявку як спеціаліста наразі не схвалено. Будь ласка, ознайомтеся з причиною нижче, оновіть дані та надішліть повторно.", reasonLabel: "Причина", cta: "Редагувати заявку" },
  sr: { preview: "O vašoj prijavi", headline: "Vaša prijava nije odobrena", intro: "Vaša prijava kao pružaoca usluga trenutno nije odobrena. Molimo pogledajte razlog ispod, ažurirajte podatke i pošaljite ponovo.", reasonLabel: "Razlog", cta: "Uredi prijavu" },
  me: { preview: "O vašoj prijavi", headline: "Vaša prijava nije odobrena", intro: "Vaša prijava kao pružaoca usluga trenutno nije odobrena. Molimo pogledajte razlog ispod, ažurirajte podatke i pošaljite ponovo.", reasonLabel: "Razlog", cta: "Uredi prijavu" },
  ar: { preview: "بخصوص طلبك", headline: "لم تتم الموافقة على طلبك", intro: "لم تتم الموافقة على طلبك كمقدم رعاية صحية في الوقت الحالي. يرجى مراجعة السبب أدناه وتحديث بياناتك وإعادة الإرسال.", reasonLabel: "السبب", cta: "تعديل طلبي" },
};

/**
 * Locale-keyed subject lines for the decision email. Mirrors the established
 * HEALTH_*_EMAIL_SUBJECT: Record<Locale,string> convention (lib/saglik/reminder-templates.ts)
 * so a non-TR provider never receives a localized body under a hardcoded Turkish subject.
 */
export const HEALTH_PROVIDER_DECISION_EMAIL_SUBJECT: Record<
  "approved" | "rejected",
  Record<EmailLocale, string>
> = {
  approved: {
    tr: "Profiliniz onaylandı — Glatko Sağlık",
    en: "Your profile is approved — Glatko Health",
    de: "Ihr Profil wurde freigegeben — Glatko Health",
    it: "Il tuo profilo è approvato — Glatko Health",
    ru: "Ваш профиль одобрен — Glatko Health",
    uk: "Ваш профіль схвалено — Glatko Health",
    sr: "Vaš profil je odobren — Glatko Zdravlje",
    me: "Vaš profil je odobren — Glatko Zdravlje",
    ar: "تمت الموافقة على ملفك — Glatko الصحة",
  },
  rejected: {
    tr: "Başvurunuz hakkında — Glatko Sağlık",
    en: "About your application — Glatko Health",
    de: "Zu Ihrer Bewerbung — Glatko Health",
    it: "Riguardo alla tua candidatura — Glatko Health",
    ru: "О вашей заявке — Glatko Health",
    uk: "Про вашу заявку — Glatko Health",
    sr: "O vašoj prijavi — Glatko Zdravlje",
    me: "O vašoj prijavi — Glatko Zdravlje",
    ar: "بخصوص طلبك — Glatko الصحة",
  },
};

export function HealthProviderDecisionEmail({
  locale,
  providerName,
  decision,
  reason,
  ctaUrl,
}: HealthProviderDecisionEmailProps) {
  const common = getEmailStrings(locale);
  const c = (decision === "approved" ? COPY_APPROVED : COPY_REJECTED)[locale];
  const cleanReason = (reason ?? "").trim();

  return (
    <EmailLayout preview={c.preview} locale={locale}>
      <EmailSectionTitle>{c.headline}</EmailSectionTitle>
      <Text className="email-text m-0 mb-[12px] text-[15px] leading-[24px] text-glatko-dark">
        {common.greeting}
        {providerName.trim() ? ` ${providerName.trim()},` : ","}
      </Text>
      <Text className="email-text m-0 mb-[16px] text-[15px] leading-[24px] text-glatko-dark">
        {c.intro}
      </Text>
      {decision === "rejected" && cleanReason ? (
        <Section className="mb-[20px]">
          <Text className="email-text m-0 mb-[8px] text-[14px] leading-[22px] text-glatko-dark">
            <span className="font-medium">{c.reasonLabel}:</span> {cleanReason}
          </Text>
        </Section>
      ) : null}
      <EmailPrimaryButton href={ctaUrl}>{c.cta}</EmailPrimaryButton>
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
