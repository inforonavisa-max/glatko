import { Section, Text } from "@react-email/components";
import * as React from "react";
import {
  EmailLayout,
  EmailPrimaryButton,
  EmailSectionTitle,
} from "@/lib/email/templates/email-layout";
import { getEmailStrings, type EmailLocale } from "@/lib/email/templates/translations";

/**
 * T+24h post-appointment follow-up. PRIVATE feedback only — there is NO public
 * review surface for health (decision K5). The link points at the patient's own
 * manage page (/health/r/[token]); a dedicated private-feedback surface, if ever
 * wanted, is a separate sprint.
 */
export type HealthFollowupEmailProps = {
  locale: EmailLocale;
  patientName: string;
  doctor: string;
  /** Private feedback link (manage page). */
  feedbackUrl: string;
};

type Copy = {
  preview: string;
  headline: string;
  intro: string;
  privacyNote: string;
  cta: string;
};

const COPY: Record<EmailLocale, Copy> = {
  tr: { preview: "Görüşünüz bizim için önemli", headline: "Randevunuz nasıl geçti?", intro: "{doctor} ile randevunuzu tamamladınız. Deneyiminiz hizmetimizi geliştirmemize yardımcı olur.", privacyNote: "Geri bildiriminiz özeldir — herkese açık olarak yayınlanmaz.", cta: "Görüşünüzü paylaşın" },
  en: { preview: "Your feedback matters", headline: "How was your appointment?", intro: "You recently had an appointment with {doctor}. Your experience helps us improve our service.", privacyNote: "Your feedback is private — it is never published publicly.", cta: "Share your feedback" },
  de: { preview: "Ihr Feedback zählt", headline: "Wie war Ihr Termin?", intro: "Sie hatten kürzlich einen Termin bei {doctor}. Ihre Erfahrung hilft uns, besser zu werden.", privacyNote: "Ihr Feedback ist privat — es wird niemals öffentlich veröffentlicht.", cta: "Feedback geben" },
  it: { preview: "Il tuo parere conta", headline: "Com'è andato l'appuntamento?", intro: "Hai avuto di recente un appuntamento con {doctor}. La tua esperienza ci aiuta a migliorare.", privacyNote: "Il tuo feedback è privato — non viene mai pubblicato.", cta: "Lascia un feedback" },
  ru: { preview: "Ваше мнение важно", headline: "Как прошёл ваш приём?", intro: "Недавно у вас был приём у {doctor}. Ваш отзыв помогает нам становиться лучше.", privacyNote: "Ваш отзыв конфиденциален — он никогда не публикуется.", cta: "Оставить отзыв" },
  uk: { preview: "Ваша думка важлива", headline: "Як пройшов ваш прийом?", intro: "Нещодавно у вас був прийом у {doctor}. Ваш відгук допомагає нам ставати кращими.", privacyNote: "Ваш відгук конфіденційний — він ніколи не публікується.", cta: "Залишити відгук" },
  sr: { preview: "Vaše mišljenje je važno", headline: "Kako je prošao vaš termin?", intro: "Nedavno ste imali termin kod {doctor}. Vaše iskustvo nam pomaže da budemo bolji.", privacyNote: "Vaš utisak je privatan — nikada se ne objavljuje javno.", cta: "Podijelite utisak" },
  me: { preview: "Vaše mišljenje je važno", headline: "Kako je prošao vaš termin?", intro: "Nedavno ste imali termin kod {doctor}. Vaše iskustvo nam pomaže da budemo bolji.", privacyNote: "Vaš utisak je privatan — nikada se ne objavljuje javno.", cta: "Podijelite utisak" },
  ar: { preview: "رأيك يهمنا", headline: "كيف كان موعدك؟", intro: "لقد كان لديك موعد مؤخراً مع {doctor}. تجربتك تساعدنا على تحسين خدمتنا.", privacyNote: "ملاحظاتك خاصة — لا تُنشر علناً أبداً.", cta: "شارك رأيك" },
};

export function HealthFollowupEmail({
  locale,
  patientName,
  doctor,
  feedbackUrl,
}: HealthFollowupEmailProps) {
  const common = getEmailStrings(locale);
  const c = COPY[locale];

  return (
    <EmailLayout preview={c.preview} locale={locale}>
      <EmailSectionTitle>{c.headline}</EmailSectionTitle>
      <Text className="email-text m-0 mb-[12px] text-[15px] leading-[24px] text-glatko-dark">
        {common.greeting}
        {patientName.trim() ? ` ${patientName.trim()},` : ","}
      </Text>
      <Text className="email-text m-0 mb-[16px] text-[15px] leading-[24px] text-glatko-dark">
        {c.intro.replace("{doctor}", doctor)}
      </Text>
      <EmailPrimaryButton href={feedbackUrl}>{c.cta}</EmailPrimaryButton>
      <Section className="mt-[12px]">
        <Text className="email-muted m-0 text-[13px] leading-[20px] text-slate-500">
          {c.privacyNote}
        </Text>
      </Section>
      <Section className="mt-[24px]">
        <Text className="email-muted m-0 text-[13px] text-slate-500">{common.regards}</Text>
      </Section>
    </EmailLayout>
  );
}
