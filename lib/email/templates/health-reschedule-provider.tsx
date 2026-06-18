import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/**
 * Provider-facing reschedule notice (H9). A patient moved their slot. Minimal
 * patient PII (first name only). No appointment link to the provider — the only
 * link is the patient's manage_token (their cancel credential), never sent to
 * the provider. A provider-scoped link can be added once H7's dashboard exists.
 */
export type HealthRescheduleProviderEmailProps = {
  locale: EmailLocale;
  providerName: string;
  patientFirstName: string;
  /** Already localized OLD date/time string (Europe/Podgorica). */
  oldDateTime: string;
  /** Already localized NEW date/time string (Europe/Podgorica). */
  newDateTime: string;
  serviceName: string;
  locationLabel: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  fromLabel: string;
  toLabel: string;
  serviceLabel: string;
  patientLabel: string;
  whereLabel: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Randevu taşındı", headline: "Bir randevu taşındı", intro: "Bir hasta randevusunu taşıdı:", fromLabel: "Eski tarih / saat", toLabel: "Yeni tarih / saat", serviceLabel: "Hizmet", patientLabel: "Hasta", whereLabel: "Konum" },
  en: { preview: "Appointment moved", headline: "An appointment was moved", intro: "A patient moved their appointment:", fromLabel: "Previous date / time", toLabel: "New date / time", serviceLabel: "Service", patientLabel: "Patient", whereLabel: "Location" },
  de: { preview: "Termin verschoben", headline: "Ein Termin wurde verschoben", intro: "Ein Patient hat seinen Termin verschoben:", fromLabel: "Bisheriges Datum / Uhrzeit", toLabel: "Neues Datum / Uhrzeit", serviceLabel: "Leistung", patientLabel: "Patient", whereLabel: "Ort" },
  it: { preview: "Appuntamento spostato", headline: "Un appuntamento è stato spostato", intro: "Un paziente ha spostato il suo appuntamento:", fromLabel: "Data / ora precedente", toLabel: "Nuova data / ora", serviceLabel: "Servizio", patientLabel: "Paziente", whereLabel: "Luogo" },
  ru: { preview: "Запись перенесена", headline: "Запись перенесена", intro: "Пациент перенёс свою запись:", fromLabel: "Прежняя дата / время", toLabel: "Новая дата / время", serviceLabel: "Услуга", patientLabel: "Пациент", whereLabel: "Место" },
  uk: { preview: "Запис перенесено", headline: "Запис перенесено", intro: "Пацієнт переніс свій запис:", fromLabel: "Попередня дата / час", toLabel: "Нова дата / час", serviceLabel: "Послуга", patientLabel: "Пацієнт", whereLabel: "Місце" },
  sr: { preview: "Termin pomjeren", headline: "Termin je pomjeren", intro: "Pacijent je pomjerio svoj termin:", fromLabel: "Prethodni datum / vrijeme", toLabel: "Novi datum / vrijeme", serviceLabel: "Usluga", patientLabel: "Pacijent", whereLabel: "Lokacija" },
  me: { preview: "Termin pomjeren", headline: "Termin je pomjeren", intro: "Pacijent je pomjerio svoj termin:", fromLabel: "Prethodni datum / vrijeme", toLabel: "Novi datum / vrijeme", serviceLabel: "Usluga", patientLabel: "Pacijent", whereLabel: "Lokacija" },
  ar: { preview: "تم نقل الموعد", headline: "تم نقل موعد", intro: "قام مريض بنقل موعده:", fromLabel: "التاريخ / الوقت السابق", toLabel: "التاريخ / الوقت الجديد", serviceLabel: "الخدمة", patientLabel: "المريض", whereLabel: "الموقع" },
};

export function HealthRescheduleProviderEmail({
  locale,
  providerName,
  patientFirstName,
  oldDateTime,
  newDateTime,
  serviceName,
  locationLabel,
}: HealthRescheduleProviderEmailProps) {
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
          <span className={lbl}>{c.fromLabel}:</span> {oldDateTime}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.toLabel}:</span> {newDateTime}
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
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
