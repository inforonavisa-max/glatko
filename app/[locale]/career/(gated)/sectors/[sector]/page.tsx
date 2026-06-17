import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { ChevronLeft, SearchX } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import {
  getShowcaseWorkers,
  listSectors,
  type ShowcaseWorkerCard,
} from "@/lib/kariyer/queries";
import { sectorIcon, tradeIcon } from "@/lib/kariyer/category-icons";
import { WorkerCard } from "@/components/glatko-kariyer/WorkerCard";

type Props = {
  params:
    | Promise<{ locale: string; sector: string }>
    | { locale: string; sector: string };
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

// MIRROR app/[locale]/health/(gated)/[specialty]/page.tsx, BUT per BUILD-RULES R5
// + spec 04 this detail page renders a per-viewer/per-employer ANONYMIZED grid, so
// it must NOT be ISR-cached — force-dynamic instead of `revalidate`. (The static
// sectors HUB at /career/sectors keeps revalidate=3600; this personalized detail
// page does not.) No generateStaticParams: the data comes from the public read-RPC
// over supabase-js (non-cacheable); unknown sectors validate below and 404, so no
// build-time pre-render is needed. noindex is inherited from the career layout's
// robots quarantine — no SEO metadata beyond `title`.
export const dynamic = "force-dynamic";

// R12 — UNTHROTTLED SCRAPE SURFACE: this is a page route, so lib/rateLimit.ts's
// `public-form` cap does NOT cover it. Server-side pagination (p_limit/p_offset,
// no bulk export / "load all") is the structural throttle. Keep it that way.
const PAGE_LIMIT = 24;

/** First single-valued searchParam, coercing absent/blank/array to null. */
function readParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | null {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s && s.trim() ? s : null;
}

/**
 * Distinct trade chips derived from the already-fetched page of worker cards
 * (best-effort — NO separate bulk fetch, R12). Each trade carries a slug used for
 * the icon + the `?trade=` round-trip and a display label + count. There is no
 * dedicated "list trades" RPC yet, so we degrade gracefully: an empty derivation
 * simply omits the chip row (spec 04 §3). Order is by descending count then label.
 */
function deriveTrades(
  workers: ShowcaseWorkerCard[],
): Array<{ slug: string; label: string; count: number }> {
  const byLabel = new Map<string, { slug: string; label: string; count: number }>();
  for (const w of workers) {
    const label = (w.trade ?? "").trim();
    if (!label) continue;
    const slug = label.toLowerCase().replace(/\s+/g, "-");
    const existing = byLabel.get(slug);
    if (existing) existing.count += 1;
    else byLabel.set(slug, { slug, label, count: 1 });
  }
  return Array.from(byLabel.values()).sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, sector } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};
  const sectors = await listSectors(locale as Locale);
  const match = sectors.find((s) => s.slug === sector);
  return { title: match?.name ?? undefined };
}

export default async function SectorDetailPage({ params, searchParams }: Props) {
  const { locale, sector } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const sp = (await Promise.resolve(searchParams)) ?? {};
  const t = await getTranslations();
  const l = locale as Locale;
  const sd = (k: string) => t(`careerVertical.sectors.${k}`);
  const pd = (k: string) => t(`careerVertical.pool.${k}`);
  const cd = (k: string) => t(`careerVertical.pool.card.${k}`);

  // Validate the sector + get its localized name (unknown slug → 404). Next 14.2
  // returns 200 in dev for notFound(); prod is a real HTTP 404 (spec 04 / R8 #8).
  const sectors = await listSectors(l);
  const sectorInfo = sectors.find((s) => s.slug === sector);
  if (!sectorInfo) notFound();

  // Active trade filter (from the chip links) round-trips through the browse RPC's
  // p_trade arg — NOT a client-side .filter() over a full dump (R12). An unknown
  // chip just returns the empty state.
  const tradeFilter = readParam(sp, "trade");

  // The anonymized showcase grid for this sector (+ optional trade). Reads the VIEW
  // ONLY via the RPC; a genuine RPC failure throws → (gated)/error.tsx. An empty []
  // is the soft-fail "pool not yet seeded" state, not an error (spec 04 §UI states).
  const workers = await getShowcaseWorkers({
    sector,
    trade: tradeFilter,
    limit: PAGE_LIMIT,
  });

  // Trade chips: best-effort secondary derivation. A failure here must NOT take down
  // the grid (mirror health's getNextSlotsBySpecialty try/catch) — degrade to no row.
  // When a trade filter is active we derive from an UNFILTERED probe so the chip row
  // stays complete (and resettable), exactly like the spec's "keep the chip row
  // visible so the user can reset" requirement. Capped by PAGE_LIMIT (no bulk pull).
  let trades: Array<{ slug: string; label: string; count: number }> = [];
  try {
    const tradeSource = tradeFilter
      ? await getShowcaseWorkers({ sector, limit: PAGE_LIMIT })
      : workers;
    trades = deriveTrades(tradeSource);
  } catch {
    trades = [];
  }

  // Intro subtitle: slug-specific dictionary copy (sectors.<slug>.intro) when it
  // exists, falling back to the generic sectors subtitle for unmapped sectors.
  const intro = t.has(`careerVertical.sectors.${sector}.intro`)
    ? sd(`${sector}.intro`)
    : sd("subtitle");

  const Icon = sectorIcon(sector);

  // Card labels — the WorkerCard's 7-field public contract (see WorkerCard.tsx).
  // No name/contact/identity field is ever passed; cards stay anonymized + LOCKED
  // (public viewer → viewerRole "anon", no interest buttons, only the locked
  // "view profile" affordance). Full interest flow lives on the pool/detail surface.
  const cardLabels = {
    verified: cd("verifiedBadge"),
    readinessLabel: cd("readinessLabel"),
    expressInterest: cd("expressInterest"),
    interestSent: cd("interestMarked"),
    viewLocked: cd("viewProfile"),
    employerLoginRequired: pd("loginPrompt"),
    photoAlt: cd("photoBlurredNote"),
  };

  return (
    <div className="bg-brandCareer-50/40 dark:bg-transparent">
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-28">
        <Link
          href="/career/sectors"
          className="inline-flex items-center gap-1 text-sm font-medium text-brandCareer-700 hover:underline dark:text-brandCareer"
        >
          <ChevronLeft className="h-4 w-4" />
          {sd("title")}
        </Link>

        <div className="mt-6 flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brandCareer-50 dark:bg-brandCareer/15">
            <Icon className="h-6 w-6 text-brandCareer" />
          </span>
          <div>
            <h1 className="font-serif text-3xl font-light tracking-tight text-gray-900 dark:text-white">
              {sectorInfo.name ?? sectorInfo.slug}
            </h1>
            <p className="text-sm text-gray-500 dark:text-white/50">{intro}</p>
          </div>
        </div>

        {/* Trades-within-sector row (career-specific addition vs health). Each chip
            round-trips `?trade=` through the browse RPC; "All trades" clears it.
            Omitted entirely when the derivation is empty (spec 04 §3). */}
        {trades.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={{ pathname: "/career/sectors/[sector]", params: { sector } }}
              aria-pressed={!tradeFilter}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:focus-visible:ring-offset-0 ${
                !tradeFilter
                  ? "bg-brandCareer-50 text-brandCareer-700 ring-1 ring-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                  : "bg-brandCareer-50/60 text-brandCareer-700 hover:bg-brandCareer-50 dark:bg-brandCareer/10 dark:text-brandCareer"
              }`}
            >
              {sd("rolesLabel")}
            </Link>
            {trades.map((tr) => {
              const TradeIcon = tradeIcon(tr.slug);
              const isActive = tradeFilter === tr.slug;
              return (
                <Link
                  key={tr.slug}
                  href={{
                    pathname: "/career/sectors/[sector]",
                    params: { sector },
                    query: { trade: tr.slug },
                  }}
                  aria-pressed={isActive}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brandCareer focus-visible:ring-offset-1 dark:focus-visible:ring-offset-0 ${
                    isActive
                      ? "bg-brandCareer-50 text-brandCareer-700 ring-1 ring-brandCareer dark:bg-brandCareer/15 dark:text-brandCareer"
                      : "bg-brandCareer-50/60 text-brandCareer-700 hover:bg-brandCareer-50 dark:bg-brandCareer/10 dark:text-brandCareer"
                  }`}
                >
                  <TradeIcon className="h-3.5 w-3.5 shrink-0" />
                  {tr.label}
                </Link>
              );
            })}
          </div>
        )}

        {workers.length === 0 ? (
          /* Empty (soft-fail) — designed, not a fake card and not a 404. The sector
             is valid; the pool is just unpopulated (or the trade filter matched
             nothing). When a trade filter is active the chip row above stays visible
             so the viewer can clear it (spec 04 §UI states). */
          <div className="mt-12 rounded-2xl border border-dashed border-gray-300 bg-white/50 p-10 text-center dark:border-white/15 dark:bg-white/5">
            <SearchX className="mx-auto h-8 w-8 text-gray-400" />
            <h2 className="mt-4 font-semibold text-gray-900 dark:text-white">
              {pd("noResultsTitle")}
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500 dark:text-white/50">
              {pd("noResultsBody")}
            </p>
            {tradeFilter && (
              <Link
                href={{ pathname: "/career/sectors/[sector]", params: { sector } }}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-brandCareer/40 bg-brandCareer-50 px-4 py-2 text-sm font-semibold text-brandCareer-700 transition-colors hover:bg-brandCareer-50/70 dark:bg-brandCareer/15 dark:text-brandCareer"
              >
                {sd("rolesLabel")}
              </Link>
            )}
          </div>
        ) : (
          /* Success — one-column grid of WIDE anonymized cards (like health). Public
             viewer: every card is inherently LOCKED (viewerRole "anon"); no interest
             buttons on this surface — only the locked "view profile" affordance. */
          <div className="mt-8 grid gap-4">
            {workers.map((w) => (
              <WorkerCard
                key={w.workerCode}
                worker={w}
                photoUrl={null}
                viewerRole="anon"
                interestSent={false}
                labels={cardLabels}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
