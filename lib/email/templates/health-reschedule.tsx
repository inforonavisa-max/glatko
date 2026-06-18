import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/**
 * Patient-facing reschedule notice (H9). An appointment is a MOVE, not a
 * cancel+rebook — this single message shows the old time → the new time and
 * links to the NEW appointment's manage page. Replaces the would-be
 * cancelled+confirm pair for a reschedule.
 */
export type HealthRescheduleEmailProps = {
  locale: EmailLocale;
  patientName: string;
  doctor: string;
  /** Already localized OLD date/time string (Europe/Podgorica). */
  oldDateTime: string;
  /** Already localized NEW date/time string (Europe/Podgorica). */
  newDateTime: string;
  serviceName: string;
  /** Link to the NEW appointment's manage page. */
  manageUrl: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  fromLabel: string;
  toLabel: string;
  serviceLabel: string;
  doctorLabel: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Randevunuz taşındı", headline: "Randevunuz taşındı", intro: "Randevunuz aşağıdaki yeni zamana taşındı.", fromLabel: "Eski tarih / saat", toLabel: "Yeni tarih / saat", serviceLabel: "Hizmet", doctorLabel: "Uzman", cta: "Randevuyu yönet" },
  en: { preview: "Your appointment was moved", headline: "Your appointment was moved", intro: "Your appointment has been moved to the new time below.", fromLabel: "Previous date / time", toLabel: "New date / time", serviceLabel: "Service", doctorLabel: "Specialist", cta: "Manage appointment" },
  de: { preview: "Ihr Termin wurde verschoben", headline: "Ihr Termin wurde verschoben", intro: "Ihr Termin wurde auf die unten stehende neue Zeit verschoben.", fromLabel: "Bisheriges Datum / Uhrzeit", toLabel: "Neues Datum / Uhrzeit", serviceLabel: "Leistung", doctorLabel: "Fachperson", cta: "Termin verwalten" },
  it: { preview: "Appuntamento spostato", headline: "Il tuo appuntamento è stato spostato", intro: "Il tuo appuntamento è stato spostato al nuovo orario qui sotto.", fromLabel: "Data / ora precedente", toLabel: "Nuova data / ora", serviceLabel: "Servizio", doctorLabel: "Specialista", cta: "Gestisci appuntamento" },
  ru: { preview: "Запись перенесена", headline: "Ваша запись перенесена", intro: "Ваша запись перенесена на новое время ниже.", fromLabel: "Прежняя дата / время", toLabel: "Новая дата / время", serviceLabel: "Услуга", doctorLabel: "Специалист", cta: "Управление записью" },
  uk: { preview: "Запис перенесено", headline: "Ваш запис перенесено", intro: "Ваш запис перенесено на новий час нижче.", fromLabel: "Попередня дата / час", toLabel: "Нова дата / час", serviceLabel: "Послуга", doctorLabel: "Спеціаліст", cta: "Керувати записом" },
  sr: { preview: "Termin je pomjeren", headline: "Vaš termin je pomjeren", intro: "Vaš termin je pomjeren na novo vrijeme ispod.", fromLabel: "Prethodni datum / vrijeme", toLabel: "Novi datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", cta: "Upravljaj terminom" },
  me: { preview: "Termin je pomjeren", headline: "Vaš termin je pomjeren", intro: "Vaš termin je pomjeren na novo vrijeme ispod.", fromLabel: "Prethodni datum / vrijeme", toLabel: "Novi datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", cta: "Upravljaj terminom" },
  ar: { preview: "تم نقل موعدك", headline: "تم نقل موعدك", intro: "تم نقل موعدك إلى الوقت الجديد أدناه.", fromLabel: "التاريخ / الوقت السابق", toLabel: "التاريخ / الوقت الجديد", serviceLabel: "الخدمة", doctorLabel: "المختص", cta: "إدارة الموعد" },
};

export function HealthRescheduleEmail({
  locale,
  patientName,
  doctor,
  oldDateTime,
  newDateTime,
  serviceName,
  manageUrl,
}: HealthRescheduleEmailProps) {
  const common = getEmailStrings(locale);
  const c = COPY[locale];
  const row = "email-text m-0 mb-[8px] text-[14px] leading-[22px] text-glatko-dark";
  const lbl = "font-medium";

  return (
    <EmailLayout preview={c.preview} locale={locale}>
      <EmailSectionTitle>{c.headline}</EmailSectionTitle>
      <Text className="email-text m-0 mb-[12px] text-[15px] leading-[24px] text-glatko-dark">
        {common.greeting}
        {patientName.trim() ? ` ${patientName.trim()},` : ","}
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
          <span className={lbl}>{c.doctorLabel}:</span> {doctor}
        </Text>
      </Section>
      <EmailPrimaryButton href={manageUrl}>{c.cta}</EmailPrimaryButton>
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
