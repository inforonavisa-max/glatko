import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

export type HealthCancelledEmailProps = {
  locale: EmailLocale;
  patientName: string;
  doctor: string;
  /** Already localized date/time string (Europe/Podgorica). */
  dateTime: string;
  serviceName: string;
  /** Link to rebook / find a new slot (the manage page). */
  rebookUrl: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  whenLabel: string;
  serviceLabel: string;
  doctorLabel: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Randevunuz iptal edildi", headline: "Randevunuz iptal edildi", intro: "Aşağıdaki randevunuz iptal edildi. Dilerseniz yeni bir randevu oluşturabilirsiniz.", whenLabel: "Tarih / saat", serviceLabel: "Hizmet", doctorLabel: "Uzman", cta: "Yeni randevu oluştur" },
  en: { preview: "Your appointment was cancelled", headline: "Your appointment was cancelled", intro: "The appointment below has been cancelled. You can book a new one whenever you like.", whenLabel: "Date / time", serviceLabel: "Service", doctorLabel: "Specialist", cta: "Book a new appointment" },
  de: { preview: "Ihr Termin wurde storniert", headline: "Ihr Termin wurde storniert", intro: "Der untenstehende Termin wurde storniert. Sie können jederzeit einen neuen buchen.", whenLabel: "Datum / Uhrzeit", serviceLabel: "Leistung", doctorLabel: "Fachperson", cta: "Neuen Termin buchen" },
  it: { preview: "Appuntamento annullato", headline: "Il tuo appuntamento è stato annullato", intro: "L'appuntamento qui sotto è stato annullato. Puoi prenotarne uno nuovo quando vuoi.", whenLabel: "Data / ora", serviceLabel: "Servizio", doctorLabel: "Specialista", cta: "Prenota un nuovo appuntamento" },
  ru: { preview: "Запись отменена", headline: "Ваша запись отменена", intro: "Запись ниже была отменена. Вы можете записаться снова в любое время.", whenLabel: "Дата / время", serviceLabel: "Услуга", doctorLabel: "Специалист", cta: "Записаться снова" },
  uk: { preview: "Запис скасовано", headline: "Ваш запис скасовано", intro: "Запис нижче було скасовано. Ви можете записатися знову в будь-який час.", whenLabel: "Дата / час", serviceLabel: "Послуга", doctorLabel: "Спеціаліст", cta: "Записатися знову" },
  sr: { preview: "Termin je otkazan", headline: "Vaš termin je otkazan", intro: "Termin ispod je otkazan. Možete zakazati novi kad god želite.", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", cta: "Zakaži novi termin" },
  me: { preview: "Termin je otkazan", headline: "Vaš termin je otkazan", intro: "Termin ispod je otkazan. Možete zakazati novi kad god želite.", whenLabel: "Datum / vrijeme", serviceLabel: "Usluga", doctorLabel: "Specijalista", cta: "Zakaži novi termin" },
  ar: { preview: "تم إلغاء موعدك", headline: "تم إلغاء موعدك", intro: "تم إلغاء الموعد أدناه. يمكنك حجز موعد جديد في أي وقت.", whenLabel: "التاريخ / الوقت", serviceLabel: "الخدمة", doctorLabel: "المختص", cta: "حجز موعد جديد" },
};

export function HealthCancelledEmail({
  locale,
  patientName,
  doctor,
  dateTime,
  serviceName,
  rebookUrl,
}: HealthCancelledEmailProps) {
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
      </Section>
      <EmailPrimaryButton href={rebookUrl}>{c.cta}</EmailPrimaryButton>
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
