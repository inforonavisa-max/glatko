"use client";

import { useState } from "react";
import { UserRound } from "lucide-react";

/**
 * WatermarkedPhoto — the shared "face-blurred + watermarked work-photo thumb"
 * referenced by the pool card (Spec 05) and the worker detail photo strip
 * (Spec 06 §5). One component, size-parameterized (`thumb` | `detail`).
 *
 * Mirrors the avatar block in components/glatko-saglik/ProviderCard.tsx (the
 * rounded-tile shape, object-cover fit, and the bg-brand{X}-50 / text-brand{X}-700
 * fallback), swapping brandHealth → brandCareer (amber). We deliberately DIVERGE
 * on the <img> element (plain <img>, NOT next/image — see below) and we never
 * render a name (the showcase types carry none — workerCode is the only id).
 *
 * PHASE-1: the "blur" here is a pure CSS effect (filter: blur(...)) plus a baked
 * CSS text watermark "Glatko · RoNa Legal". This is cosmetic DETERRENCE ONLY — a
 * CSS blur is trivially reversible by removing the style. The real identity gate
 * is the DB showcase VIEW + the signer (BUILD-RULES R6: signShowcaseVariant only
 * ever signs a `visibility = 'public_anonymized'` derived variant), NEVER this
 * CSS. Server-side ML face-blur + watermark baking into the derived variant is a
 * later document/upload-pipeline task (PART 3), tracked separately. Do NOT
 * "harden" this by piling on more CSS — ship the ML pipeline instead.
 *
 * There is intentionally NO prop or branch that yields a clean original. The
 * un-blurred photo is only ever revealed in the employer dashboard after
 * owner-approval + payment, via a different render path entirely. This component
 * trusts the upstream contract and does not sign or fetch anything itself.
 *
 * Plain <img> (NOT next/image), deliberate divergence from ProviderCard:
 *  1. Showcase variants are served via short-lived/dynamic signed URLs
 *     (per-session, R5/R6) — not the stable, cacheable origins next/image
 *     expects; routing them through the Next optimizer adds a caching layer we
 *     explicitly do not want on per-viewer gated pages.
 *  2. The whole point is a degraded, watermarked render — we do not want Next
 *     generating crisp responsive srcset variants of a photo we are
 *     intentionally obscuring.
 *  3. Pool/detail pages are force-dynamic + noindex; image-optimization SEO/LCP
 *     wins don't apply.
 *
 * force-dynamic host: the optional per-session watermark personalizes the render,
 * so host pages are force-dynamic and uncached (R5). This component is stateless
 * but must not be memoized in a way that would share one employer's watermark
 * with another — it isn't (no module-level cache, viewerId flows by prop).
 */

type Size = "thumb" | "detail";

const SIZE: Record<
  Size,
  { box: string; rounded: string; blur: string; watermark: string }
> = {
  // thumbnail — pool card use (Spec 05): square ~96px tile.
  thumb: {
    box: "h-24 w-24",
    rounded: "rounded-xl",
    blur: "blur-[3px]",
    watermark: "text-[9px]",
  },
  // detail — worker detail strip (Spec 06 §5): larger 4:3 panel, blur a touch
  // stronger so the silhouette reads but the face does not.
  detail: {
    box: "h-40 w-full aspect-[4/3]",
    rounded: "rounded-2xl",
    blur: "blur-[5px]",
    watermark: "text-xs",
  },
};

export function WatermarkedPhoto({
  src,
  alt,
  size = "thumb",
  viewerId,
  labels,
}: {
  /**
   * Already-derived `public_anonymized` showcase-variant URL (blurred/watermarked
   * upstream). null/absent → fallback tile. The host (Spec 05/06) ONLY ever
   * passes a showcase variant here; it must never hand this component a
   * gated-original path. R6's signShowcaseVariant enforces
   * `visibility = 'public_anonymized'` upstream — this component trusts that
   * contract.
   */
  src: string | null | undefined;
  /**
   * Non-identifying alt text — the worker code or a generic localized "worker
   * photo" string. NEVER a name/contact (there is no name on this surface;
   * BUILD-RULES R8 #9).
   */
  alt: string;
  size?: Size;
  /**
   * Optional employer/session id for the per-session dynamic watermark (PART 4
   * best-practice). When present it is appended to the brand watermark so a
   * leaked screenshot traces back to the viewing session. Absent → static brand
   * watermark only.
   */
  viewerId?: string;
  /** Localized labels owned by the parent (mirror ProviderCard's `labels` prop). */
  labels: { fallback: string };
}) {
  // error / broken image → swap to the same fallback tile as the empty state.
  const [errored, setErrored] = useState(false);
  // loading shimmer until the <img> reports load; reserve the box (no CLS).
  const [loaded, setLoaded] = useState(false);

  const s = SIZE[size];

  // empty / error → fallback tile (no watermark; nothing to protect). This is
  // the common Phase-1 state until the upload pipeline produces variants.
  if (!src || errored) {
    return (
      <div
        className={`flex ${s.box} shrink-0 items-center justify-center ${s.rounded} bg-brandCareer-50 text-brandCareer-700 ring-1 ring-brandCareer/20 dark:bg-brandCareer/15 dark:text-brandCareer dark:ring-brandCareer/20`}
        role="img"
        aria-label={labels.fallback}
      >
        <UserRound
          className={size === "detail" ? "h-10 w-10" : "h-7 w-7"}
          aria-hidden
        />
      </div>
    );
  }

  // success → blurred showcase variant + watermark overlay + thin amber frame.
  const watermarkText = viewerId
    ? `Glatko · RoNa Legal · ${viewerId}`
    : "Glatko · RoNa Legal";

  return (
    <div
      className={`relative ${s.box} shrink-0 overflow-hidden ${s.rounded} bg-gray-100 ring-1 ring-brandCareer/20 dark:bg-white/5 dark:ring-brandCareer/20`}
    >
      {/* loading shimmer — neutral gray, no amber; covered once the img loads. */}
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-gray-200 dark:bg-white/10" />
      )}

      {/* base layer — plain <img>, CSS-blurred (Phase-1 deterrence, reversible). */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
        onContextMenu={(e) => e.preventDefault()}
        className={`h-full w-full select-none object-cover ${s.blur} ${
          loaded ? "opacity-100" : "opacity-0"
        } transition-opacity`}
      />

      {/* watermark overlay — diagonal "Glatko · RoNa Legal" (+ optional session
          id) over a subtle dark scrim for legibility on any photo, light or
          dark. pointer-events-none + select-none. The overlay is the visible
          Phase-1 guarantee even if the variant already has a baked watermark.
          Symmetric layout → renders correctly mirrored under RTL (ar). */}
      <div className="pointer-events-none absolute inset-0 select-none bg-black/15">
        <span
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-[30deg] whitespace-nowrap font-semibold uppercase tracking-wide text-white/70 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] ${s.watermark}`}
        >
          {watermarkText}
        </span>
      </div>
    </div>
  );
}
