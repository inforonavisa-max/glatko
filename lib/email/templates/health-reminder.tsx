import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/** t24 = 24h-before, t2 = 2h-before. Same layout, different lead-in copy. */
export type HealthReminderVariant = "t24" | "t2";

export type HealthReminderEmailProps = {
  locale: EmailLocale;
  variant: HealthReminderVariant;
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
  preview24: string;
  preview2: string;
  headline24: string;
  headline2: string;
  intro24: string;
  intro2: string;
  whenLabel: string;
  serviceLabel: string;
  doctorLabel: string;
  whereLabel: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview24: "Yarın randevunuz var", preview2: "Randevunuza 2 saat kaldı", headline24: "Yarın randevunuz var", headline2: "Randevunuza 2 saat kaldı", intro24: "Bu bir hatırlatmadır — yarınki randevunuzun detayları:", intro2: "Bu bir hatırlatmadır — randevunuza 2 saat kaldı:", whenLabel: "Tarih / saat", serviceLabel: "Hizmet", doctorLabel: "Uzman", whereLabel: "Konum", cta: "Randevuyu görüntüle / iptal et" },
  en: { preview24: "Your appointment is tomorrow", preview2: "Your appointment is in 2 hours", headline24: "Your appointment is tomorrow", headline2: "Your appointment is in 2 hours", intro24: "A friendly reminder — here are your appointment details for tomorrow:", intro2: "A friendly reminder — your appointment is in 2 hours:", whenLabel: "Date / time", serviceLabel: "Service", doctorLabel: "Specialist", whereLabel: "Location", cta: "View / cancel appointment" },
  de: { preview24: "Ihr Termin ist morgen", preview2: "Ihr Termin ist in 2 Stunden", headline24: "Ihr Termin ist morgen", headline2: "Ihr Termin ist in 2 Stunden", intro24: "Eine Erinnerung — hier sind Ihre Termindetails für morgen:", intro2: "Eine Erinnerung — Ihr Termin ist in 2 Stunden:", whenLabel: "Datum / Uhrzeit", serviceLabel: "Leistung", doctorLabel: "Fachperson", whereLabel: "Ort", cta: "Termin ansehen / stornieren" },
  it: { preview24: "Il tuo appuntamento è domani", preview2: "Il tuo appuntamento è tra 2 ore", headline24: "Il tuo appuntamento è domani", headline2: "Il tuo appuntamento è tra 2 ore", intro24: "Un promemoria — ecco i dettagli del tuo appuntamento di domani:", intro2: "Un promemoria — il tuo appuntamento è tra 2 ore:", whenLabel: "Data / ora", serviceLabel: "Servizio", doctorLabel: "Specialista", whereLabel: "Luogo", cta: "Vedi / annulla appuntamento" },
  ru: { preview24: "Ваша запись завтра", preview2: "Ваша запись через 2 часа", headline24: "Ваша запись завтра", headline2: "Ваша запись через 2 часа", intro24: "Напоминание — детали вашей записи на завтра:", intro2: "Напоминание — ваша запись через 2 часа:", whenLabel: "Дата / время", serviceLabel: "Услуга", doctorLabel: "Специалист", whereLabel: "Место", cta: "Посмотреть / отменить запись" },
  uk: { preview24: "Ваш запис завтра", preview2: "Ваш запис через 2 години", headline24: "Ваш запис завтра", headline2: "Ваш запис через 2 години", intro24: "Нагадування — деталі вашого запису на завтра:", intro2: "Нагадування — ваш запис через 2 години:", whenLabel: "Дата / час", serviceLabel: "Послуга", doctorLabel: "Спеціаліст", whereLabel: "Місце", cta: "Переглянути / скасувати запис" },
  sr: { preview24: "Vaš termin je sjutra", preview2: "Vaš termin je za 2 sata", headline24: "Vaš termin je sjutra", headline2: "Vaš termin je za 2 sata", intro24: "Podsjetnik — detalji vašeg termina za sjutra:", intro2: "Podsjetnik — vaš termin je za 2 sata:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", whereLabel: "Lokacija", cta: "Pogledaj / otkaži termin" },
  me: { preview24: "Vaš termin je sjutra", preview2: "Vaš termin je za 2 sata", headline24: "Vaš termin je sjutra", headline2: "Vaš termin je za 2 sata", intro24: "Podsjetnik — detalji vašeg termina za sjutra:", intro2: "Podsjetnik — vaš termin je za 2 sata:", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", whereLabel: "Lokacija", cta: "Pogledaj / otkaži termin" },
  ar: { preview24: "موعدك غداً", preview2: "موعدك بعد ساعتين", headline24: "موعدك غداً", headline2: "موعدك بعد ساعتين", intro24: "تذكير — تفاصيل موعدك غداً:", intro2: "تذكير — موعدك بعد ساعتين:", whenLabel: "التاريخ / الوقت", serviceLabel: "الخدمة", doctorLabel: "المختص", whereLabel: "الموقع", cta: "عرض / إلغاء الموعد" },
};

export function HealthReminderEmail({
  locale,
  variant,
  patientName,
  doctor,
  dateTime,
  serviceName,
  locationLabel,
  locationAddress,
  locationCity,
  manageUrl,
}: HealthReminderEmailProps) {
  const common = getEmailStrings(locale);
  const c = COPY[locale];
  const is24 = variant === "t24";
  const preview = is24 ? c.preview24 : c.preview2;
  const headline = is24 ? c.headline24 : c.headline2;
  const intro = is24 ? c.intro24 : c.intro2;
  const row = "email-text m-0 mb-[8px] text-[14px] leading-[22px] text-glatko-dark";
  const lbl = "font-medium";

  return (
    <EmailLayout preview={preview} locale={locale}>
      <EmailSectionTitle>{headline}</EmailSectionTitle>
      <Text className="email-text m-0 mb-[12px] text-[15px] leading-[24px] text-glatko-dark">
        {common.greeting}
        {patientName.trim() ? ` ${patientName.trim()},` : ","}
      </Text>
      <Text className="email-text m-0 mb-[16px] text-[15px] leading-[24px] text-glatko-dark">
        {intro}
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
