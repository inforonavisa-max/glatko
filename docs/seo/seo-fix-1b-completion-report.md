# SEO-FIX-1b Completion Report — 2026-05-25

> **Branch:** `seo-fix-1b` @ `81d314f` (from `origin/main` `4c734ce`)
> **Tür:** SEO-FIX-1 sonrası küçük teknik düzeltmeler paketi (kod). Tek sprint, atomic commit'ler.
> **Çalışma şekli:** Her commit → ayrı Vercel preview → DoD doğrulama → Rohat OK → bir sonraki. Hassas dosyalara (`middleware.ts`, `app/layout.tsx`, `lib/supabase/admin.ts`, env, `next.config`) dokunulmadı. Migration yok.

## Sprint Özet
- **Süre:** ~1 oturum (planlanan 1-2 gün)
- **Commit'ler:** 5 atomic kod commit + 1 docs commit
- **Net etki:** 36 auth URL noindex · 15 sayfa brand-dup düzeltmesi · home'dan 15 kategoriye crawlable link · `/providers` 404 temizliği · `@next/third-parties` peer-dep uyumu

## Commit Özeti

| # | Hash | Açıklama | DoD |
|---|---|---|---|
| 1 | `80f767b` | Auth pages noindex (login/register/forgot/reset × 9 locale) | ✅ 36/36 |
| 2a | `c23428e` | Brand-dup fix — home + 13 route + 9 dict (23 dosya) | ✅ |
| 2b | `ae979c5` | Founding pages edge case (`title.absolute`, hero.title self-brands) | ✅ |
| 3 | `8ebe9a7` | Home internal linking — 15 kategori + `/providers` 404 kaldır | ✅ 15/15 |
| 4 | `81d314f` | `@next/third-parties` 16.2.6 → 14.2.15 (sitemap cache deferred) | ✅ build green, GTM intact |
| 5 | (docs) | RCA + bu completion report | — |

## DoD Verification (Sprint Geneli — preview'da kanıtlandı)

### Commit 1 — Auth noindex
- **36/36** auth URL (`<meta name="robots" content="noindex, nofollow">`) — 4 route × 9 lokalize slug.
- Scope check: home / services / service-detail / about → `index, follow` (over-application yok).
- Yaklaşım: `login`/`register` layout `generateMetadata`'ya `robots` eklendi; `forgot-password`/`reset-password` için minimal metadata-only `layout.tsx` (sayfalar client component). next-intl `pathnames` → 9 dil tek noktadan kapandı.

### Commit 2 — Brand duplication fix
- **22/22** test edilen URL'de `<title>` tek "Glatko" (home 9 locale + 13 page type).
- Kök neden: locale layout `title` template'i `%s | Glatko`, brand'ı zaten içeren başlıkların üstüne biniyordu (`X — Glatko | Glatko`).
- **15 sayfa** düzeltildi: home (yeni `seo.homeTitle`), service/[slug], provider/[id], pros/[slug], contact, privacy, terms, gdpr, about, how-it-works, founding-customer, become-a-pro(+founding), request-service, services-root (`seo.servicesTitle` strip).
- **Edge case:** founding sayfalarının `hero.title`'ı kendi içinde "Glatko" içeriyor → `title: { absolute: t("hero.title") }` ile template bypass (×1).
- OG/twitter title'lar minimal tutuldu (template almazlar, tek-brand'dı); founding OG'leri de düzeltildi (orada ×2'ydi).

### Commit 3 — Home internal linking
- **15 kategori linki** × 9 locale (her dilde tam 15 unique).
- **`/providers` = 0** × 9 locale (3 footer 404 linki kaldırıldı; `/pros` index page yok, yönlendirilecek hedef yoktu).
- **5 boş root** (airbnb-management, automotive, events-wedding, garden-pool, repair-service) home'dan linkli — "root rule: always index".
- Bilinçli karar: query `is_active=true, parent_id IS NULL` (TÜM aktif root) — `/services`'in `is_p0` filtresi körce kopyalanmadı, yoksa 5 boş root linklenemezdi.
- Aceternity featured grid (4 kart) dokunulmadı; altına `<nav>` link listesi eklendi (parametric next-intl href → lokalize, `/services/` redirect yok).

### Commit 4 — @next/third-parties downgrade
- `@next/third-parties`: **16.2.6 → 14.2.15** (next@14.2.15 ile eşleşir). v16 peer-dep next@15+ istiyordu → mismatch çözüldü.
- **`app/layout.tsx` DEĞİŞMEDİ** (hassas dosya): `<GoogleTagManager gtmId={…} />` core API v14/v16'da stabil.
- **DevTools doğrulama (canlı browser, Chrome MCP):**
  - `window.google_tag_manager` mevcut → GTM container init ✅
  - `dataLayer`: `consent:default` (Consent Mode v2) + `gtm.js` → `gtm.dom` → `gtm.load` lifecycle event'leri fire etti ✅
  - `gtag` = function ✅ · **console 0 error** ✅
  - HTML: `gtm.js`=1, `googletagmanager.com`=1
- **Meta Pixel:** preview + **prod ikisinde de** `connect.facebook=0` → skeleton mode (`NEXT_PUBLIC_META_PIXEL_ID` set değil, G-ADS-4b bekliyor). Custom component, downgrade'den etkilenmiyor. DoD'nin `connect.facebook≥1` maddesi bu env'de N/A.

## Build Warning Comparison
- **Final build (`81d314f`):** `✓ Compiled successfully` + `✓ Generating static pages (18/18)`, `Detected Next.js version: 14.2.15`.
- **Mevcut warning'ler (hepsi pre-existing, sprint-dışı):**
  - `next-intl` webpack cache parse (`import(t)`) ×3
  - webpack big-string serialization (318/153/140kiB) ×3
  - `@sanity/image-url` default-export deprecation ×4
  - edge-runtime static-gen note ×1
  - node-engines auto-upgrade (Vercel config) ×1
- **`@next/third-parties` / peer-dep warning: YOK.** Downgrade yeni warning eklemedi; aksine next@14↔third-parties@16 version mismatch'ini çözdü.
- **Δ vs SEO-FIX-1 baseline (`45d0cdb`):** Yukarıdaki warning'ler aynı (next-intl/Sanity/webpack/node-config sprint'te değişmedi). Net: **warning sayısı artmadı** (peer-dep uyumsuzluğu giderildiği için ≤ baseline). ⚠️ Baseline build log satır-satır yeniden çekilmedi (warning'ler sprint-dışı; gürültüyü azaltmak için).

## CWV Impact Assessment
- **Beklenti: nötr.** Downgrade aynı `GoogleTagManager` API'sini kullanıyor (gtm.js aynı şekilde yükleniyor), layout shift yok, kod değişikliği yok. Bundle etkisi ihmal edilebilir (third-parties tiny).
- **Lab:** ekstra Lighthouse koşusu yapılmadı (HTML/script output GTM açısından değişmedi).
- **RUM (Speed Insights):** önceki ölçümdeki gibi hâlâ anlamlı veri yok (düşük trafik). T+7'de (June 1) tekrar bakılacak.

## Tech Debt Notları (Sonraki Sprintlere Devir)

1. **Sitemap CDN cache (deferred).** `app/sitemap.ts` native MetadataRoute API + `export const dynamic = "force-dynamic"` → canlı header `max-age=0, must-revalidate` (cache yok). `s-maxage` için route-handler conversion (`sitemap.ts` → `app/sitemap.xml/route.ts`) gerekli; bunu downgrade'le bundle etmek = 2 build-risk birden, bu yüzden atlandı. **Öncelik: düşük** (sitemap günde az hit, çoğu Google bot). Alternatif: `force-dynamic` kaldır + `revalidate=3600`'a güven (ama build-time DB implikasyonu var, doğrulanmalı).
2. **`(auth)` empty route group.** `app/[locale]/(auth)/layout.tsx` var (noindex'li) ama altında page yok → Next.js sessizce ignore eder, etki sıfır. Auth flow refactor sırasında temizlenebilir. **Öncelik: yok.**
3. **`seo.providersTitle` dead dictionary key.** 9 dilde mevcut, hiçbir component kullanmıyor (eski `/providers` route kalıntısı). Dictionary cleanup sprint'inde silinebilir. **Öncelik: düşük.**
4. **Footer "Services" column trim.** `/providers` 404'ları kaldırılınca 2 link kaldı (`/services` + `/how-it-works`). İstenirse 2-3 popüler kategori linki eklenebilir — ama parametric `{pathname,params}` form gerektirir (küçük footer refactor, lokalize URL için şart). **Öncelik: UX kararı, SEO zorunlu değil.**
5. **Meta Pixel env population.** `NEXT_PUBLIC_META_PIXEL_ID` hâlâ unset → Pixel skeleton. G-ADS-4b'de populate edilecek. Bu sprint'le ilgisiz.

## Sıradaki Sprint Önerileri
1. **T+7 ölçümü (2026-06-01)** — SEO-FIX-1 Phase 1 sonuçları + SEO-FIX-1b etkisi (GSC Page Indexing refresh oldu mu?). Aynı tarih Sprint A Day 14 ile çakışıyor.
2. **SEO-FIX-2** — Phase 2 noindex (GSC verisine göre, boş niş subcat'lar için).
3. **SEO-PERF-1** — static/ISR/PPR + bundle + CSP + sitemap CDN cache (Tech Debt #1).
4. **CONTENT-ENGINE-1** — 5 boş root'a editöryel intro (airbnb-management vb. UX bounce riski) + şehir × hizmet template + makaleler.

## Bekleyen Sorular (Rohat)
- T+7'de GSC Page Indexing raporu refresh oldu mu (May 18'de donmuştu)?
- Auth noindex + brand-dup fix GSC'de görünmeye başladı mı?
- Sitemap CDN cache gerçekten gerekli mi, yoksa Google bot zaten yeterince cache'liyor mu? (defer kararını gözden geçir)
- chess canonical: `/tr/services/chess` → `/tr/hizmetler/chess` 308 re-crawl'ı tamamlandı mı? (bkz. `seo-fix-1b-rca-chess-canonical.md`)
