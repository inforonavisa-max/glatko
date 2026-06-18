import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/**
 * Provider-facing new-booking notice. Minimal patient PII by design: only the
 * patient's first name is shown (never phone/email/full name/note).
 */
export type HealthProviderNewBookingEmailProps = {
  locale: EmailLocale;
  /** Provider display name (greeting). */
  providerName: string;
  /** Patient first name only — minimal PII. */
  patientFirstName: string;
  /** Already localized date/time string (Europe/Podgorica). */
  dateTime: string;
  serviceName: string;
  locationLabel: string;
  /**
   * Optional provider-scoped appointment link. Intentionally omitted in H6 v1: the
   * only existing appointment link is keyed on the patient's manage_token (the patient's
   * own cancel credential), which must NEVER be sent to the provider. A provider-scoped
   * link can be supplied once the H7 provider dashboard exists (auth-gated, not token-based).
   */
  detailsUrl?: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  whenLabel: string;
  serviceLabel: string;
  patientLabel: string;
  whereLabel: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Yeni randevu", headline: "Yeni bir randevunuz var", intro: "Takviminize yeni bir randevu eklendi:", whenLabel: "Tarih / saat", serviceLabel: "Hizmet", patientLabel: "Hasta", whereLabel: "Konum", cta: "Randevuyu görüntüle" },
  en: { preview: "New booking", headline: "You have a new booking", intro: "A new appointment has been added to your calendar:", whenLabel: "Date / time", serviceLabel: "Service", patientLabel: "Patient", whereLabel: "Location", cta: "View appointment" },
  de: { preview: "Neue Buchung", headline: "Sie haben eine neue Buchung", intro: "Ein neuer Termin wurde Ihrem Kalender hinzugefügt:", whenLabel: "Datum / Uhrzeit", serviceLabel: "Leistung", patientLabel: "Patient", whereLabel: "Ort", cta: "Termin ansehen" },
  it: { preview: "Nuova prenotazione", headline: "Hai una nuova prenotazione", intro: "Un nuovo appuntamento è stato aggiunto al tuo calendario:", whenLabel: "Data / ora", serviceLabel: "Servizio", patientLabel: "Paziente", whereLabel: "Luogo", cta: "Vedi appuntamento" },
  ru: { preview: "Новая запись", headline: "У вас новая запись", intro: "В ваш календарь добавлена новая запись:", whenLabel: "Дата / время", serviceLabel: "Услуга", patientLabel: "Пациент", whereLabel: "Место", cta: "Посмотреть запись" },
  uk: { preview: "Новий запис", headline: "У вас новий запис", intro: "До вашого календаря додано новий запис:", whenLabel: "Дата / час", serviceLabel: "Послуга", patientLabel: "Пацієнт", whereLabel: "Місце", cta: "Переглянути запис" },
  sr: { preview: "Novi termin", headline: "Imate novi termin", intro: "Novi termin je dodat u vaš kalendar:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", patientLabel: "Pacijent", whereLabel: "Lokacija", cta: "Pogledaj termin" },
  me: { preview: "Novi termin", headline: "Imate novi termin", intro: "Novi termin je dodat u vaš kalendar:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", patientLabel: "Pacijent", whereLabel: "Lokacija", cta: "Pogledaj termin" },
  ar: { preview: "حجز جديد", headline: "لديك حجز جديد", intro: "تمت إضافة موعد جديد إلى تقويمك:", whenLabel: "التاريخ / الوقت", serviceLabel: "الخدمة", patientLabel: "المريض", whereLabel: "الموقع", cta: "عرض الموعد" },
};

export function HealthProviderNewBookingEmail({
  locale,
  providerName,
  patientFirstName,
  dateTime,
  serviceName,
  locationLabel,
  detailsUrl,
}: HealthProviderNewBookingEmailProps) {
  const common = getEmailStrings(locale);
  const c = COPY[locale];
  const row = "email-text m-0 mb-[8px] text-[14px] leading-[22px] text-glatko-dark";
  const lbl = "font-medium";

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
      <Section className="mb-[20px]">
        <Text className={row}>
          <span className={lbl}>{c.whenLabel}:</span> {dateTime}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.serviceLabel}:</span> {serviceName}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.patientLabel}:</span> {patientFirstName}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.whereLabel}:</span> {locationLabel}
        </Text>
      </Section>
      {detailsUrl ? <EmailPrimaryButton href={detailsUrl}>{c.cta}</EmailPrimaryButton> : null}
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
