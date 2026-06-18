import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

export type HealthBookingConfirmEmailProps = {
  locale: EmailLocale;
  patientName: string;
  doctor: string;
  /** Already localized date/time string (Europe/Podgorica). */
  dateTime: string;
  serviceName: string;
  locationLabel: string;
  locationAddress: string;
  locationCity: string;
  manageUrl: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  whenLabel: string;
  serviceLabel: string;
  doctorLabel: string;
  whereLabel: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Randevunuz onaylandı", headline: "Randevunuz onaylandı ✓", intro: "Randevunuz başarıyla oluşturuldu. Detaylar:", whenLabel: "Tarih / saat", serviceLabel: "Hizmet", doctorLabel: "Uzman", whereLabel: "Konum", cta: "Randevuyu yönet / iptal et" },
  en: { preview: "Your appointment is confirmed", headline: "Your appointment is confirmed ✓", intro: "Your appointment has been booked. Details:", whenLabel: "Date / time", serviceLabel: "Service", doctorLabel: "Specialist", whereLabel: "Location", cta: "Manage / cancel appointment" },
  de: { preview: "Ihr Termin ist bestätigt", headline: "Ihr Termin ist bestätigt ✓", intro: "Ihr Termin wurde gebucht. Details:", whenLabel: "Datum / Uhrzeit", serviceLabel: "Leistung", doctorLabel: "Fachperson", whereLabel: "Ort", cta: "Termin verwalten / stornieren" },
  it: { preview: "Appuntamento confermato", headline: "Appuntamento confermato ✓", intro: "Il tuo appuntamento è stato prenotato. Dettagli:", whenLabel: "Data / ora", serviceLabel: "Servizio", doctorLabel: "Specialista", whereLabel: "Luogo", cta: "Gestisci / annulla appuntamento" },
  ru: { preview: "Запись подтверждена", headline: "Запись подтверждена ✓", intro: "Ваша запись оформлена. Детали:", whenLabel: "Дата / время", serviceLabel: "Услуга", doctorLabel: "Специалист", whereLabel: "Место", cta: "Управлять / отменить запись" },
  uk: { preview: "Запис підтверджено", headline: "Запис підтверджено ✓", intro: "Ваш запис оформлено. Деталі:", whenLabel: "Дата / час", serviceLabel: "Послуга", doctorLabel: "Спеціаліст", whereLabel: "Місце", cta: "Керувати / скасувати запис" },
  sr: { preview: "Termin potvrđen", headline: "Termin potvrđen ✓", intro: "Vaš termin je zakazan. Detalji:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", whereLabel: "Lokacija", cta: "Upravljaj / otkaži termin" },
  me: { preview: "Termin potvrđen", headline: "Termin potvrđen ✓", intro: "Vaš termin je zakazan. Detalji:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", whereLabel: "Lokacija", cta: "Upravljaj / otkaži termin" },
  ar: { preview: "تم تأكيد موعدك", headline: "تم تأكيد موعدك ✓", intro: "تم حجز موعدك بنجاح. التفاصيل:", whenLabel: "التاريخ / الوقت", serviceLabel: "الخدمة", doctorLabel: "المختص", whereLabel: "الموقع", cta: "إدارة / إلغاء الموعد" },
};

export function HealthBookingConfirmEmail({
  locale,
  patientName,
  doctor,
  dateTime,
  serviceName,
  locationLabel,
  locationAddress,
  locationCity,
  manageUrl,
}: HealthBookingConfirmEmailProps) {
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
          <span className={lbl}>{c.whenLabel}:</span> {dateTime}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.serviceLabel}:</span> {serviceName}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.doctorLabel}:</span> {doctor}
        </Text>
        <Text className={row}>
          <span className={lbl}>{c.whereLabel}:</span> {locationLabel}, {locationAddress}, {locationCity}
        </Text>
      </Section>
      <EmailPrimaryButton href={manageUrl}>{c.cta}</EmailPrimaryButton>
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
