import { ImageResponse } from "next/og";
import { getFontsForLocale } from "@/lib/seo/og-fonts";
import { listSpecialties } from "@/lib/saglik/queries";
import type { Locale } from "@/i18n/routing";

/**
 * H10 — OG image for a health specialty listing page. Reuses the services/[slug] OG
 * pattern; the specialty name is read (localized) via listSpecialties. Runtime is
 * nodejs (the health queries layer is server-only / service-role, not edge-safe).
 * Factual only (specialty name + "doctors in Montenegro") — no superlatives.
 */
export const runtime = "nodejs";
export const alt = "Glatko Health Specialty";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_BG = "linear-gradient(135deg, #0b1f23 0%, #06141a 50%, #0b1f23 100%)";
const TEAL = "#14B8A6";

const SUBLINES: Record<string, string> = {
  me: "Ljekari u Crnoj Gori",
  sr: "Lekari u Crnoj Gori",
  en: "Doctors in Montenegro",
  tr: "Karadağ'daki doktorlar",
  de: "Ärzte in Montenegro",
  it: "Medici in Montenegro",
  ru: "Врачи в Черногории",
  ar: "أطباء في الجبل الأسود",
  uk: "Лікарі в Чорногорії",
};

export default async function HealthSpecialtyOG({
  params,
}: {
  params: { locale: string; specialty: string };
}) {
  const isRTL = params.locale === "ar";
  const subline = SUBLINES[params.locale] || SUBLINES.en;

  let heading = "Glatko";
  try {
    const specialties = await listSpecialties(params.locale as Locale);
    const match = specialties.find((s) => s.slug === params.specialty);
    if (match) heading = match.name;
  } catch {
    // Degrade to the brand name — never throw from an OG handler.
  }

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
                fontSize: 92,
                fontWeight: 700,
                lineHeight: 1.05,
                letterSpacing: isRTL ? 0 : -1.5,
                maxWidth: 980,
                textShadow: "0 4px 32px rgba(0,0,0,0.6)",
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
