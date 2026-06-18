import type { Locale } from "@/i18n/routing";

/**
 * H6 — backend SMS bodies + email subjects for health reminder notifications.
 *
 * These are NOT UI dictionary strings (messages/*.json); they are short transactional
 * copy sent over SMS/email, so they live here as plain Record<Locale,...> maps. Pure:
 * no `server-only`, no DB, no React — directly unit-testable under vitest.
 *
 * SMS builders take ({dt}=localized date/time, {dr}=doctor, {url}=manage/feedback link).
 * sr/me are written in Latin script (matching the rest of the Glatko UI); ar is RTL.
 *
 * Templates:
 *  - confirm               (patient, SMS+email) — moved from booking.ts; shared with the
 *                          immediate route dispatch so confirm copy never drifts.
 *  - t24 / t2              (patient, SMS) — 24h / 2h-before reminders.
 *  - cancelled             (patient, SMS+email) — appointment cancelled notice.
 *  - provider_new_booking  (provider, SMS+email) — provider-facing, minimal patient PII.
 *  - followup              (patient, SMS+email) — T+24h, PRIVATE feedback link only (K5).
 */

export type SmsBuilder = (dt: string, dr: string, url: string) => string;
/** provider_new_booking is provider-facing: (dt, dr=patient first name, url). */
export type ProviderSmsBuilder = (dt: string, patientFirstName: string, url: string) => string;
/** reschedule (patient): the move from {oldDt} → {newDt}, the doctor, the new manage url. */
export type RescheduleSmsBuilder = (oldDt: string, newDt: string, dr: string, url: string) => string;
/** reschedule_provider: the move {oldDt} → {newDt} + patient first name (no manage url to provider). */
export type RescheduleProviderSmsBuilder = (
  oldDt: string,
  newDt: string,
  patientFirstName: string,
) => string;

// ─── confirm (patient) ───────────────────────────────────────────────────────
export const HEALTH_CONFIRM_SMS: Record<Locale, SmsBuilder> = {
  tr: (dt, dr, url) => `Glatko Sağlık: Randevunuz onaylandı — ${dt}, ${dr}. Yönet/iptal: ${url}`,
  en: (dt, dr, url) => `Glatko Health: Your appointment is confirmed — ${dt}, ${dr}. Manage/cancel: ${url}`,
  de: (dt, dr, url) => `Glatko Health: Ihr Termin ist bestätigt — ${dt}, ${dr}. Verwalten/stornieren: ${url}`,
  it: (dt, dr, url) => `Glatko Health: Appuntamento confermato — ${dt}, ${dr}. Gestisci/annulla: ${url}`,
  ru: (dt, dr, url) => `Glatko Health: Запись подтверждена — ${dt}, ${dr}. Управление/отмена: ${url}`,
  uk: (dt, dr, url) => `Glatko Health: Запис підтверджено — ${dt}, ${dr}. Керування/скасування: ${url}`,
  sr: (dt, dr, url) => `Glatko Zdravlje: Termin potvrđen — ${dt}, ${dr}. Upravljaj/otkaži: ${url}`,
  me: (dt, dr, url) => `Glatko Zdravlje: Termin potvrđen — ${dt}, ${dr}. Upravljaj/otkaži: ${url}`,
  ar: (dt, dr, url) => `Glatko الصحة: تم تأكيد موعدك — ${dt}، ${dr}. الإدارة/الإلغاء: ${url}`,
};

export const HEALTH_CONFIRM_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Randevunuz onaylandı — Glatko Sağlık",
  en: "Your appointment is confirmed — Glatko Health",
  de: "Ihr Termin ist bestätigt — Glatko Health",
  it: "Appuntamento confermato — Glatko Health",
  ru: "Запись подтверждена — Glatko Health",
  uk: "Запис підтверджено — Glatko Health",
  sr: "Termin potvrđen — Glatko Zdravlje",
  me: "Termin potvrđen — Glatko Zdravlje",
  ar: "تم تأكيد موعدك — Glatko الصحة",
};

// ─── t24 (patient — 24h before) ──────────────────────────────────────────────
export const HEALTH_T24_SMS: Record<Locale, SmsBuilder> = {
  tr: (dt, dr, url) => `Glatko Sağlık hatırlatma: Yarın randevunuz var — ${dt}, ${dr}. Detay/iptal: ${url}`,
  en: (dt, dr, url) => `Glatko Health reminder: Your appointment is tomorrow — ${dt}, ${dr}. Details/cancel: ${url}`,
  de: (dt, dr, url) => `Glatko Health Erinnerung: Ihr Termin ist morgen — ${dt}, ${dr}. Details/stornieren: ${url}`,
  it: (dt, dr, url) => `Promemoria Glatko Health: Appuntamento domani — ${dt}, ${dr}. Dettagli/annulla: ${url}`,
  ru: (dt, dr, url) => `Напоминание Glatko Health: Запись завтра — ${dt}, ${dr}. Детали/отмена: ${url}`,
  uk: (dt, dr, url) => `Нагадування Glatko Health: Запис завтра — ${dt}, ${dr}. Деталі/скасування: ${url}`,
  sr: (dt, dr, url) => `Glatko Zdravlje podsjetnik: Termin je sjutra — ${dt}, ${dr}. Detalji/otkaži: ${url}`,
  me: (dt, dr, url) => `Glatko Zdravlje podsjetnik: Termin je sjutra — ${dt}, ${dr}. Detalji/otkaži: ${url}`,
  ar: (dt, dr, url) => `تذكير Glatko الصحة: موعدك غداً — ${dt}، ${dr}. التفاصيل/الإلغاء: ${url}`,
};

// ─── t2 (patient — 2h before) ────────────────────────────────────────────────
export const HEALTH_T2_SMS: Record<Locale, SmsBuilder> = {
  tr: (dt, dr, url) => `Glatko Sağlık: Randevunuza 2 saat kaldı — ${dt}, ${dr}. Detay/iptal: ${url}`,
  en: (dt, dr, url) => `Glatko Health: Your appointment is in 2 hours — ${dt}, ${dr}. Details/cancel: ${url}`,
  de: (dt, dr, url) => `Glatko Health: Ihr Termin ist in 2 Stunden — ${dt}, ${dr}. Details/stornieren: ${url}`,
  it: (dt, dr, url) => `Glatko Health: Appuntamento tra 2 ore — ${dt}, ${dr}. Dettagli/annulla: ${url}`,
  ru: (dt, dr, url) => `Glatko Health: Запись через 2 часа — ${dt}, ${dr}. Детали/отмена: ${url}`,
  uk: (dt, dr, url) => `Glatko Health: Запис через 2 години — ${dt}, ${dr}. Деталі/скасування: ${url}`,
  sr: (dt, dr, url) => `Glatko Zdravlje: Termin za 2 sata — ${dt}, ${dr}. Detalji/otkaži: ${url}`,
  me: (dt, dr, url) => `Glatko Zdravlje: Termin za 2 sata — ${dt}, ${dr}. Detalji/otkaži: ${url}`,
  ar: (dt, dr, url) => `Glatko الصحة: موعدك بعد ساعتين — ${dt}، ${dr}. التفاصيل/الإلغاء: ${url}`,
};

export const HEALTH_T24_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Yarın randevunuz var — Glatko Sağlık",
  en: "Reminder: your appointment is tomorrow — Glatko Health",
  de: "Erinnerung: Ihr Termin ist morgen — Glatko Health",
  it: "Promemoria: appuntamento domani — Glatko Health",
  ru: "Напоминание: запись завтра — Glatko Health",
  uk: "Нагадування: запис завтра — Glatko Health",
  sr: "Podsjetnik: termin je sjutra — Glatko Zdravlje",
  me: "Podsjetnik: termin je sjutra — Glatko Zdravlje",
  ar: "تذكير: موعدك غداً — Glatko الصحة",
};

export const HEALTH_T2_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Randevunuza 2 saat kaldı — Glatko Sağlık",
  en: "Reminder: your appointment is in 2 hours — Glatko Health",
  de: "Erinnerung: Ihr Termin ist in 2 Stunden — Glatko Health",
  it: "Promemoria: appuntamento tra 2 ore — Glatko Health",
  ru: "Напоминание: запись через 2 часа — Glatko Health",
  uk: "Нагадування: запис через 2 години — Glatko Health",
  sr: "Podsjetnik: termin za 2 sata — Glatko Zdravlje",
  me: "Podsjetnik: termin za 2 sata — Glatko Zdravlje",
  ar: "تذكير: موعدك بعد ساعتين — Glatko الصحة",
};

// ─── cancelled (patient) ─────────────────────────────────────────────────────
export const HEALTH_CANCELLED_SMS: Record<Locale, SmsBuilder> = {
  tr: (dt, dr, url) => `Glatko Sağlık: Randevunuz iptal edildi — ${dt}, ${dr}. Yeni randevu: ${url}`,
  en: (dt, dr, url) => `Glatko Health: Your appointment was cancelled — ${dt}, ${dr}. Rebook: ${url}`,
  de: (dt, dr, url) => `Glatko Health: Ihr Termin wurde storniert — ${dt}, ${dr}. Neu buchen: ${url}`,
  it: (dt, dr, url) => `Glatko Health: Appuntamento annullato — ${dt}, ${dr}. Riprenota: ${url}`,
  ru: (dt, dr, url) => `Glatko Health: Запись отменена — ${dt}, ${dr}. Записаться снова: ${url}`,
  uk: (dt, dr, url) => `Glatko Health: Запис скасовано — ${dt}, ${dr}. Записатися знову: ${url}`,
  sr: (dt, dr, url) => `Glatko Zdravlje: Termin je otkazan — ${dt}, ${dr}. Novi termin: ${url}`,
  me: (dt, dr, url) => `Glatko Zdravlje: Termin je otkazan — ${dt}, ${dr}. Novi termin: ${url}`,
  ar: (dt, dr, url) => `Glatko الصحة: تم إلغاء موعدك — ${dt}، ${dr}. حجز جديد: ${url}`,
};

export const HEALTH_CANCELLED_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Randevunuz iptal edildi — Glatko Sağlık",
  en: "Your appointment was cancelled — Glatko Health",
  de: "Ihr Termin wurde storniert — Glatko Health",
  it: "Appuntamento annullato — Glatko Health",
  ru: "Запись отменена — Glatko Health",
  uk: "Запис скасовано — Glatko Health",
  sr: "Termin je otkazan — Glatko Zdravlje",
  me: "Termin je otkazan — Glatko Zdravlje",
  ar: "تم إلغاء موعدك — Glatko الصحة",
};

// ─── provider_new_booking (provider-facing) ──────────────────────────────────
export const HEALTH_PROVIDER_NEW_BOOKING_SMS: Record<Locale, ProviderSmsBuilder> = {
  tr: (dt, pn, url) => `Glatko Sağlık: Yeni randevu — ${dt}, ${pn}. Detay: ${url}`,
  en: (dt, pn, url) => `Glatko Health: New booking — ${dt}, ${pn}. Details: ${url}`,
  de: (dt, pn, url) => `Glatko Health: Neue Buchung — ${dt}, ${pn}. Details: ${url}`,
  it: (dt, pn, url) => `Glatko Health: Nuova prenotazione — ${dt}, ${pn}. Dettagli: ${url}`,
  ru: (dt, pn, url) => `Glatko Health: Новая запись — ${dt}, ${pn}. Детали: ${url}`,
  uk: (dt, pn, url) => `Glatko Health: Новий запис — ${dt}, ${pn}. Деталі: ${url}`,
  sr: (dt, pn, url) => `Glatko Zdravlje: Novi termin — ${dt}, ${pn}. Detalji: ${url}`,
  me: (dt, pn, url) => `Glatko Zdravlje: Novi termin — ${dt}, ${pn}. Detalji: ${url}`,
  ar: (dt, pn, url) => `Glatko الصحة: حجز جديد — ${dt}، ${pn}. التفاصيل: ${url}`,
};

export const HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Yeni randevu — Glatko Sağlık",
  en: "New booking — Glatko Health",
  de: "Neue Buchung — Glatko Health",
  it: "Nuova prenotazione — Glatko Health",
  ru: "Новая запись — Glatko Health",
  uk: "Новий запис — Glatko Health",
  sr: "Novi termin — Glatko Zdravlje",
  me: "Novi termin — Glatko Zdravlje",
  ar: "حجز جديد — Glatko الصحة",
};

// ─── followup (patient — T+24h, private feedback link ONLY, no public review K5) ──
export const HEALTH_FOLLOWUP_SMS: Record<Locale, SmsBuilder> = {
  tr: (dt, dr, url) => `Glatko Sağlık: ${dr} ile randevunuz nasıl geçti? Görüşünüzü paylaşın (gizli): ${url}`,
  en: (dt, dr, url) => `Glatko Health: How was your appointment with ${dr}? Share private feedback: ${url}`,
  de: (dt, dr, url) => `Glatko Health: Wie war Ihr Termin bei ${dr}? Privates Feedback geben: ${url}`,
  it: (dt, dr, url) => `Glatko Health: Com'è andato l'appuntamento con ${dr}? Lascia un feedback privato: ${url}`,
  ru: (dt, dr, url) => `Glatko Health: Как прошёл приём у ${dr}? Оставьте приватный отзыв: ${url}`,
  uk: (dt, dr, url) => `Glatko Health: Як пройшов прийом у ${dr}? Залиште приватний відгук: ${url}`,
  sr: (dt, dr, url) => `Glatko Zdravlje: Kako je prošao termin kod ${dr}? Ostavite privatni utisak: ${url}`,
  me: (dt, dr, url) => `Glatko Zdravlje: Kako je prošao termin kod ${dr}? Ostavite privatni utisak: ${url}`,
  ar: (dt, dr, url) => `Glatko الصحة: كيف كان موعدك مع ${dr}؟ شارك ملاحظاتك الخاصة: ${url}`,
};

export const HEALTH_FOLLOWUP_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Görüşünüz bizim için önemli — Glatko Sağlık",
  en: "How was your appointment? — Glatko Health",
  de: "Wie war Ihr Termin? — Glatko Health",
  it: "Com'è andato l'appuntamento? — Glatko Health",
  ru: "Как прошёл ваш приём? — Glatko Health",
  uk: "Як пройшов ваш прийом? — Glatko Health",
  sr: "Kako je prošao vaš termin? — Glatko Zdravlje",
  me: "Kako je prošao vaš termin? — Glatko Zdravlje",
  ar: "كيف كان موعدك؟ — Glatko الصحة",
};

// ─── reschedule (patient — H9: appointment MOVED, not cancelled+rebooked) ─────
// One coherent notice: the old time → the new time, with the (new) manage link.
// Fires IMMEDIATELY from the reschedule route (like confirm) → NOT slot-relative.
export const HEALTH_RESCHEDULE_SMS: Record<Locale, RescheduleSmsBuilder> = {
  tr: (o, n, dr, url) => `Glatko Sağlık: Randevunuz ${o} tarihinden ${n} tarihine taşındı — ${dr}. Yönet/iptal: ${url}`,
  en: (o, n, dr, url) => `Glatko Health: Your appointment moved from ${o} to ${n} — ${dr}. Manage/cancel: ${url}`,
  de: (o, n, dr, url) => `Glatko Health: Ihr Termin wurde von ${o} auf ${n} verschoben — ${dr}. Verwalten/stornieren: ${url}`,
  it: (o, n, dr, url) => `Glatko Health: Appuntamento spostato dal ${o} al ${n} — ${dr}. Gestisci/annulla: ${url}`,
  ru: (o, n, dr, url) => `Glatko Health: Запись перенесена с ${o} на ${n} — ${dr}. Управление/отмена: ${url}`,
  uk: (o, n, dr, url) => `Glatko Health: Запис перенесено з ${o} на ${n} — ${dr}. Керування/скасування: ${url}`,
  sr: (o, n, dr, url) => `Glatko Zdravlje: Termin pomjeren sa ${o} na ${n} — ${dr}. Upravljaj/otkaži: ${url}`,
  me: (o, n, dr, url) => `Glatko Zdravlje: Termin pomjeren sa ${o} na ${n} — ${dr}. Upravljaj/otkaži: ${url}`,
  ar: (o, n, dr, url) => `Glatko الصحة: تم نقل موعدك من ${o} إلى ${n} — ${dr}. الإدارة/الإلغاء: ${url}`,
};

export const HEALTH_RESCHEDULE_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Randevunuz taşındı — Glatko Sağlık",
  en: "Your appointment was moved — Glatko Health",
  de: "Ihr Termin wurde verschoben — Glatko Health",
  it: "Il tuo appuntamento è stato spostato — Glatko Health",
  ru: "Ваша запись перенесена — Glatko Health",
  uk: "Ваш запис перенесено — Glatko Health",
  sr: "Vaš termin je pomjeren — Glatko Zdravlje",
  me: "Vaš termin je pomjeren — Glatko Zdravlje",
  ar: "تم نقل موعدك — Glatko الصحة",
};

// ─── reschedule_provider (provider-facing — H9: a patient moved their slot) ───
// Rendered in providerLocale. Minimal PII: patient FIRST name only. No manage url
// to the provider (the only link is the patient's cancel credential). Fires
// immediately (not slot-relative).
export const HEALTH_RESCHEDULE_PROVIDER_SMS: Record<Locale, RescheduleProviderSmsBuilder> = {
  tr: (o, n, pn) => `Glatko Sağlık: Randevu taşındı — ${o} → ${n}, ${pn}.`,
  en: (o, n, pn) => `Glatko Health: Appointment moved — ${o} → ${n}, ${pn}.`,
  de: (o, n, pn) => `Glatko Health: Termin verschoben — ${o} → ${n}, ${pn}.`,
  it: (o, n, pn) => `Glatko Health: Appuntamento spostato — ${o} → ${n}, ${pn}.`,
  ru: (o, n, pn) => `Glatko Health: Запись перенесена — ${o} → ${n}, ${pn}.`,
  uk: (o, n, pn) => `Glatko Health: Запис перенесено — ${o} → ${n}, ${pn}.`,
  sr: (o, n, pn) => `Glatko Zdravlje: Termin pomjeren — ${o} → ${n}, ${pn}.`,
  me: (o, n, pn) => `Glatko Zdravlje: Termin pomjeren — ${o} → ${n}, ${pn}.`,
  ar: (o, n, pn) => `Glatko الصحة: تم نقل الموعد — ${o} ← ${n}، ${pn}.`,
};

export const HEALTH_RESCHEDULE_PROVIDER_EMAIL_SUBJECT: Record<Locale, string> = {
  tr: "Randevu taşındı — Glatko Sağlık",
  en: "Appointment moved — Glatko Health",
  de: "Termin verschoben — Glatko Health",
  it: "Appuntamento spostato — Glatko Health",
  ru: "Запись перенесена — Glatko Health",
  uk: "Запис перенесено — Glatko Health",
  sr: "Termin pomjeren — Glatko Zdravlje",
  me: "Termin pomjeren — Glatko Zdravlje",
  ar: "تم نقل الموعد — Glatko الصحة",
};
