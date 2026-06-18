import { ImageResponse } from "next/og";
import { getFontsForLocale } from "@/lib/seo/og-fonts";

/**
 * H10 — OG image for the health directory home. Reuses the services OG pattern
 * (next/og ImageResponse + getFontsForLocale) with a teal/brandHealth palette.
 * Factual heading only ("Find a doctor in Montenegro") — no superlatives (K-ethics).
 */
export const runtime = "edge";
export const alt = "Glatko Health";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_BG = "linear-gradient(135deg, #0b1f23 0%, #06141a 50%, #0b1f23 100%)";
const TEAL = "#14B8A6";

const HEADINGS: Record<string, string> = {
  me: "Pronađite ljekara u Crnoj Gori",
  sr: "Pronađite lekara u Crnoj Gori",
  en: "Find a doctor in Montenegro",
  tr: "Karadağ'da doktor bulun",
  de: "Finden Sie einen Arzt in Montenegro",
  it: "Trova un medico in Montenegro",
  ru: "Найдите врача в Черногории",
  ar: "ابحث عن طبيب في الجبل الأسود",
  uk: "Знайдіть лікаря в Чорногорії",
};

const SUBLINES: Record<string, string> = {
  me: "Zakažite termin online",
  sr: "Zakažite termin online",
  en: "Book an appointment online",
  tr: "Online randevu alın",
  de: "Termin online buchen",
  it: "Prenota un appuntamento online",
  ru: "Запишитесь на прием онлайн",
  ar: "احجز موعدًا عبر الإنترنت",
  uk: "Запишіться на прийом онлайн",
};

export default async function HealthHomeOG({ params }: { params: { locale: string } }) {
  const isRTL = params.locale === "ar";
  const heading = HEADINGS[params.locale] || HEADINGS.en;
  const subline = SUBLINES[params.locale] || SUBLINES.en;
  const fonts = await getFontsForLocale(params.locale);
  const localizedFontFamily = isRTL ? '"Noto Sans Arabic"' : undefined;

  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: BRAND_BG,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(20,184,166,0.22), transparent 70%)",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 10,
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: 80,
            direction: isRTL ? "rtl" : "ltr",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: "white", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
              Glatko
            </span>
            <div style={{ width: 12, height: 12, borderRadius: 999, background: TEAL, marginTop: 6 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div
              style={{
                display: "flex",
                color: "white",
                fontSize: 84,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: isRTL ? 0 : -2,
                maxWidth: 980,
                ...(localizedFontFamily ? { fontFamily: localizedFontFamily } : {}),
              }}
            >
              {heading}
            </div>
            <div
              style={{
                display: "flex",
                color: "rgba(255,255,255,0.65)",
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: 0.2,
                maxWidth: 880,
                ...(localizedFontFamily ? { fontFamily: localizedFontFamily } : {}),
              }}
            >
              {subline}
            </div>
          </div>

          <span style={{ color: "rgba(255,255,255,0.7)", fontSize: 28, fontWeight: 500, letterSpacing: 0.2 }}>
            glatko.app
          </span>
        </div>
      </div>
    ),
    fonts.length > 0 ? { ...size, fonts } : { ...size },
  );
}
