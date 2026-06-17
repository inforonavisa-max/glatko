import { ImageResponse } from "next/og";
import { getFontsForLocale } from "@/lib/seo/og-fonts";
import { getProvider } from "@/lib/saglik/queries";
import type { Locale } from "@/i18n/routing";

/**
 * H10 — OG image for a public health provider profile. Reuses the services/[slug] OG
 * pattern; reads the provider via getProvider (localized name + specialty + city).
 * Runtime is nodejs (the health queries layer is server-only / service-role).
 * FACTUAL only — name + specialty + city, NO superlatives (K-ethics).
 */
export const runtime = "nodejs";
export const alt = "Glatko Health Provider";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND_BG = "linear-gradient(135deg, #0b1f23 0%, #06141a 50%, #0b1f23 100%)";
const TEAL = "#14B8A6";

export default async function HealthProviderOG({
  params,
}: {
  params: { locale: string; slug: string };
}) {
  const isRTL = params.locale === "ar";

  let heading = "Glatko";
  let subline = "";
  try {
    const provider = await getProvider(params.slug, params.locale as Locale);
    if (provider) {
      heading = provider.title ? `${provider.title} ${provider.fullName}` : provider.fullName;
      const specialty = provider.specialties[0]?.name ?? "";
      const city = provider.locations[0]?.city ?? "";
      subline = [specialty, city].filter(Boolean).join(" · ");
    }
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
                fontSize: 84,
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
            {subline ? (
              <div
                style={{
                  display: "flex",
                  color: "rgba(255,255,255,0.65)",
                  fontSize: 32,
                  fontWeight: 500,
                  letterSpacing: 0.2,
                  ...(localizedFontFamily ? { fontFamily: localizedFontFamily } : {}),
                }}
              >
                {subline}
              </div>
            ) : null}
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
