# Glatko.app SEO Audit Baseline — 2026-05-22

> Read-only teknik + içerik SEO taraması. **Hiçbir kod değişikliği yapılmadı.**
> Tarama hedefi: deploy edilen kod (`origin/main` ≡ worktree `4f6f6cd`, Sprint A SEO + B2 dahil).
> Local `main` checkout'u stale (`41124ef`, Sprint A öncesi) — bilerek kullanılmadı.
> Canlı doğrulama: `https://glatko.app` (Vercel, fra1, HTTP/2, 200/307 OK).

---

## 0. Executive Summary (TL;DR)

- **Tarama kapsamı:** 56 route, 9 dil, 12 layout, dinamik sitemap (2.421 URL), canlı HTML/header/robots/sitemap doğrulaması, production build (exit 0). Tahmini süre ~25 dk (build dahil).
- **Genel SEO sağlık skoru: 73 / 100**
  - Teknik altyapı **dünya standardında** (≈88/100). Ama **içerik neredeyse boş** (≈30/100). Tek cümleyle: **"Ferrari motoru takılı, ama deposu boş."** Sıralanacak altyapı kusursuza yakın; sıralanacak *içerik* yok.

### En kritik 5 eksik
1. **İçerik boşluğu (🔴):** Blog ~1 yazı, cost-guide yok, FAQ hub yok, şehir×hizmet landing page yok. Tüm ranking yüzeyi eksik.
2. **Tüm route'lar dynamic render (🔴):** 56 route'un 55'i `ƒ` (server-rendered on demand). Marketing/katalog sayfalarında static/ISR yok → TTFB + crawl verimi.
3. **Canlı Core Web Vitals YOK (🟡):** Üç kaynak da boş — PSI (429 kota) + Vercel Speed Insights ("No data collected yet", kodda mount var ama aktif değil) + GSC CrUX (mobile+desktop "son 90 günde yeterli veri yok"). Site çok yeni/düşük-trafik → field-CWV eşiği oluşmamış. (Doğrulandı: Chrome, bkz. EK D.)
4. **Auth sayfaları indexlenebilir (🟡):** `/login`, `/register`, `/forgot-password`, `/reset-password` → `robots: index,follow` (9 dil × 4 = ~36 thin URL). noindex olmalı.
5. **Çift provider URL yüzeyi (🟡):** `/provider/[id]` (UUID, legacy) + `/pros/[slug]` (SEO slug) ikisi de canlı → duplicate content riski.

### En güçlü 3 yön
1. **Hreflang 3 kanaldan (✅):** HTML `<head>` + sitemap `xhtml:link` + middleware HTTP `Link` header. `x-default` + BCP-47 `sr-Latn-RS`/`sr-Latn-ME` ile SR/ME ayrımı. Ders kitabı seviyesi.
2. **Tam indexation altyapısı (✅):** GSC (2 DNS TXT) + Bing + Yandex doğrulanmış; dinamik sitemap (2.421 URL, her biri 9-dil alternate); gelişmiş robots.txt; IndexNow endpoint; `llms.txt` canlı.
3. **Zengin yapısal işaretleme + olgun analytics (✅):** JSON-LD (Organization, WebSite+SearchAction, LocalBusiness, Service, FAQPage, BreadcrumbList, Review, AggregateRating). `next/font` (cyrillic+latin-ext, swap), `next/image` (sadece 1 raw `<img>`). Vercel Analytics + Speed Insights + GTM Consent Mode v2 + Meta Pixel.

---

## 1. Teknik SEO Taraması (Next.js)

| # | Alan | Durum | Not |
|---|---|---|---|
| 1.1 | App Router yapısı | ✅ Var | Saf App Router, `pages/` yok. `[locale]` segment, route group `(auth)`. 56 page, 12 layout. |
| 1.2 | Metadata API | ✅ Var | 20 sayfa `generateMetadata`; `metadataBase` + `title.template "%s \| Glatko"` (root + locale layout). 18 public sayfa OG. |
| 1.3 | Hreflang | ✅ Güçlü | `<head>` (10 alternate: 9 dil + x-default) **+** sitemap **+** HTTP `Link` header. `sr-Latn-RS`/`sr-Latn-ME`. |
| 1.4 | Sitemap & robots | ✅ Var | `app/sitemap.ts` (dinamik, 2.421 URL, revalidate 3600) + `app/robots.ts` (dinamik). Canlı 200. |
| 1.5 | Schema (JSON-LD) | ✅ Güçlü | Org, WebSite+SearchAction, LocalBusiness, Service, FAQPage, Breadcrumb, Review, AggregateRating. |
| 1.6 | Canonical | ✅ Var | `alternates.canonical` (self-referential), `lib/seo.ts buildAlternates()` tek kaynak (Sprint A). |
| 1.7 | Robots meta / indexability | ⚠️ Kısmen | Admin/dashboard/settings/inbox/(auth)/review noindex ✅. **Ama login/register/forgot/reset `index,follow`.** |
| 1.8 | Image optimization | ✅ Var | 26 dosya `next/image`; 1 raw `<img>` (dekoratif aceternity). `priority` LCP'lerde. alt ≈ tam. |
| 1.9 | Font optimization | ✅ Güçlü | Inter + Cormorant, `subsets:[latin,cyrillic,latin-ext]`, `display:swap`, weight'ler denetlenmiş. |

**Detaylar:**
- **Metadata olmayan sayfalar (36):** çoğu auth/dashboard/admin/private (noindex zaten yeterli). Public istisna: `app/[locale]/page.tsx` (home) kendi `generateMetadata`'sı yok → layout default'una düşüyor. Home title canlıda: `Glatko — Karadağ'ın Premium Hizmet Platformu | Glatko` → **"Glatko" iki kez** (brand tekrarı, ufak optimizasyon).
- **robots.txt (canlı):** `Disallow: /admin/ /dashboard/ /pro/dashboard/ /inbox/ /settings/ /api/ /auth/ /preview/ /studio/` + `?sort/?view/?page` query + og/twitter image route'ları. Yandex'e özel allow (ru/uk/me/sr). 9 AI bot allow (GPTBot, ClaudeBot, PerplexityBot…). `Sitemap:` referansı var. **Çok olgun.** Ama login/register `/auth/` altında değil (`/[locale]/login`) → disallow kapsamında değil.
- **sitemap.ts içeriği:** STATIC_PAGES (11 path × 9 = 99) + DB kategorileri × 9 (root 0.8 / subcat 0.7) + onaylı provider profilleri `/pros/[slug]` × 9 (0.7) + Sanity blog × 9 (0.6). Her entry tam 9-dil + x-default alternate. `force-dynamic` (Supabase cookie bağımlılığı) + `revalidate 3600`.

**Sonuç:** Teknik SEO temeli **elit seviyede** — Sprint A canonical/hreflang konsolidasyonu canlıda çalışıyor ve 3 kanaldan emit ediliyor. Tek gerçek teknik açıklar: auth-page indexability (1.7) ve home title brand tekrarı.

---

## 2. i18n & Dil Yapısı

| # | Alan | Durum | Not |
|---|---|---|---|
| 2.1 | Aktif diller | ✅ 9 dil | tr, en, de, it, ru, uk, sr, me, ar (`SEO_LOCALES`). |
| 2.2 | Çeviri dosyaları | ✅ Var | `dictionaries/*.json` (9) + `index.ts`. next-intl 4.8.3. |
| 2.3 | Key parity | ✅ ~Tam | Leaf-key: ar/de/en/it/ru/uk=1650; me/sr/tr=1651. **1-key delta** (trivial). |
| 2.4 | URL yapısı | ✅ Güçlü | Localized slug! `/de/dienstleistungen`, `/ru/uslugi`, `/tr/giris-yap`, `/tr/profesyonel-ol`. |
| 2.5 | Locale middleware | ✅ Var | `middleware.ts` → next-intl + Supabase session + rate-limit + IndexNow + hreflang `Link` header. |
| 2.6 | BCMS cannibalization | ✅ Yönetiliyor | Sadece sr + me var (hr/bs yok). `sr-Latn-RS` vs `sr-Latn-ME` hreflang ile ayrıştırılmış. |

**Detaylar:**
- **Localized pathnames** (`i18n/routing.ts`): her dilde çevrilmiş slug → güçlü yerel SEO sinyali ve cannibalization önleyici.
- **me ↔ sr riski:** İçerik birebir aynıysa (Karadağca ≈ Sırpça Latin), Google ikisini "aynı dil" görüp birini filtreleyebilir. hreflang region-subtag bunu kısmen çözer; içerik üretiminde ME ve RS için **hafif farklılaştırma** (şehir/para birimi/yerel örnek) önerilir.

**Sonuç:** i18n kurgusu **profesyonel** — localized slug + region-subtag hreflang çoğu marketplace'in atladığı detay. 1-key parity farkı önemsiz.

---

## 3. İçerik Envanteri

| # | Alan | Durum | Not |
|---|---|---|---|
| 3.1 | Route envanteri | ✅ 56 page | Aşağıda kategorize. |
| 3.2 | Blog altyapısı | ⚠️ Boş (1 yazı) | Sanity CMS bağlı. Canlı `/tr/blog` → **tam 1 yayın** ("Karadağ'da Yat Temizliği", 09.05.2026). `glatko.app/studio` → 404 (Studio glatko.app'te host'lu değil). Doğrulandı: EK D #5. |
| 3.3 | Hizmet/kategori | ✅ Var | `/services/[slug]` DB-driven. Canlı ~15 hizmet kategorisi. |
| 3.4 | Cost-guide / FAQ | ❌ Yok | Dedike route yok. FAQPage schema var ama bağımsız FAQ/cost hub yok. |
| 3.5 | Boş / placeholder | ⚠️ Kısmen | Blog efektif boş. City landing page hiç yok. |

**Route kategorizasyonu:**
- **Public / indexable (~17):** `/` (home), `/services`, `/services/[slug]`, `/pros/[slug]`, `/provider/[id]`, `/about`, `/contact`, `/how-it-works`, `/become-a-pro`, `/become-a-pro/founding`, `/founding-customer`, `/blog`, `/blog/[slug]`, `/terms`, `/privacy`, `/cookies`, `/gdpr`.
- **Auth (⚠️ şu an indexable):** `/login`, `/register`, `/forgot-password`, `/reset-password`.
- **Private (✅ noindex):** `/dashboard/*`, `/pro/dashboard/*`, `/inbox/*`, `/messages/*`, `/my-requests/*`, `/notifications`, `/settings/*`, `/email-preferences`, `/request-service`, `/review/[requestId]`.
- **Admin (✅ noindex + robots disallow):** `/admin/*`.

**İçerik fırsatları (en büyük SEO kazancı):**
1. **Şehir × hizmet landing page'leri YOK.** Marketplace için en büyük programatik fırsat (örn. `/me/usluge/ciscenje/budva`, "Budva'da ev temizliği"). Şu an 0.
2. **Cost-guide YOK.** "X hizmeti Karadağ'da ne kadar?" → yüksek hacimli, dönüşümlü sorgular.
3. **FAQ hub YOK.** FAQPage schema mevcut ama içerik yok.
4. **Blog ~boş.** Altyapı hazır, içerik üretimi bekliyor.

⚠️ **Doğrulama gerekli:** Sanity'de tam yayınlanmış post sayısı (canlı ~1 görünüyor; Studio'dan teyit).

**Sonuç:** Asıl darboğaz burası. Teknik altyapı içeriği taşımaya hazır; üretilmiş içerik neredeyse yok. SEO-FOUNDATION sprint'i sonrası **içerik motoru** ana iş olmalı.

---

## 4. Performance & Core Web Vitals

| # | Alan | Durum | Not |
|---|---|---|---|
| 4.1 | Build / bundle | ✅ Ölçüldü | Build exit 0. Shared JS **147 kB**. **55/56 route `ƒ` (dynamic)**, sadece `/robots.txt` static. |
| 4.2 | Live CWV (PSI) | ❌ Veri yok | PSI **429 kota** + GSC CrUX "yeterli veri yok" (mobile+desktop). Field-CWV alınamıyor. EK D #2. |
| 4.3 | Vercel Speed Insights | ⚠️ Mount var, veri yok | `@vercel/speed-insights` + `<SpeedInsights/>` kodda — **ama dashboard "No data collected yet"** (aktif değil). Enable edilmeli. EK D #2. |
| 4.4 | Vercel Analytics | ✅ Kurulu+mount | `@vercel/analytics` + `<Analytics/>`. |
| 4.5 | GA / GTM | ✅ Var | `app/layout.tsx`: GTM (env-gated) + **Consent Mode v2** (ads_data_redaction, url_passthrough) + MetaPixel. `@next/third-parties`. |

**En ağır sayfalar (First Load JS):**

| Route | Page Size | First Load JS |
|---|---|---|
| `/[locale]/become-a-pro` | 15.1 kB | **326 kB** |
| `/[locale]/request-service` | 9.9 kB | **320 kB** |
| `/[locale]/inbox/[conversationId]` | 12.2 kB | 301 kB |
| `/[locale]/how-it-works`, `/founding-customer` | 0.3 kB | 280 kB |
| `/[locale]/login`, `/register`, `/forgot`, `/reset` | ~2 kB | ~283 kB |
| `/[locale]/admin/launch-metrics` | 3 kB | 275 kB |
| `/[locale]` (home) | 13.1 kB | 230 kB |
| `/[locale]/blog/[slug]` | 35.4 kB | 221 kB |

**Bulgular:**
- **🔴 Tüm route'lar dynamic:** `[locale]` layout `cookies()`/`headers()` (Supabase session + locale + x-pathname) okuduğu için tüm ağaç `force-dynamic`. Sonuç: marketing/katalog sayfaları CDN HTML cache'lenemiyor, her istek server'a gidiyor → daha yüksek TTFB + crawl maliyeti. Public sayfalar için **PPR (Next 14 partial prerender) veya auth'u layout'tan ayırıp static/ISR** büyük kazanç.
- **become-a-pro 326 kB / request-service 320 kB:** ağır client bundle (muhtemelen framer-motion, mapbox-gl, tsparticles). `@next/bundle-analyzer` kurulu → analiz et, dynamic import / lazy-load uygula.
- **Build uyarısı:** ESLint plugin çakışması (`@next/next` — worktree'nin parent `.eslintrc.json`'ı ile). Worktree-nesting artifact, kod sorunu değil; build tamamlandı.

⚠️ **Doğrulama gerekli:** Gerçek LCP/INP/CLS/TTFB → **Vercel Speed Insights dashboard** (mevcut) veya GSC "Core Web Vitals" raporu veya PSI API key. Bundle boyutları lab proxy'sidir, saha CWV'si değildir.

**Sonuç:** Asset optimizasyonu iyi (font/image/shared JS), analytics olgun. İki gerçek kaldıraç: (1) public sayfaları static/ISR'a taşımak, (2) 2-3 ağır sayfanın bundle'ını kırpmak.

---

## 5. Indexation & Google Durumu

| # | Alan | Durum | Not |
|---|---|---|---|
| 5.1 | `site:glatko.app` index sayısı | ✅ Ölçüldü | `site:` **~2.660**; GSC Pages: **Indexed 2.61K / Not indexed 2.18K**. Index ~2 May 2026 başladı. Tam 9-neden dökümü: EK D #1. |
| 5.2 | GSC verification | ✅ Var (1 property) | DNS TXT 2 adet ama GSC'de glatko'ya ait **tek aktif property: `glatko.app` (Domain)**. 2. TXT orphan/eski. EK D #8. |
| 5.3 | Bing verification | ✅ Var | `<meta name="msvalidate.01">` (env-gated, canlıda mevcut). |
| 5.4 | Yandex verification | ✅ Var | `<meta name="yandex-verification">` (canlıda mevcut). |
| 5.5 | Crawl barrier | ✅ Sağlıklı | robots.txt mantıklı; aşırı noindex yok. **Tek istisna:** auth sayfaları index'e açık (kasıtsız). |

**Ekstra indexation altyapısı:**
- **IndexNow:** `/api/indexnow` route + middleware'de `/{KEY}.txt` ownership endpoint → Bing/Yandex anlık index.
- **llms.txt:** canlı (HTTP 200) → AI/LLM crawler yönlendirmesi (AEO/GEO).
- **Sitemap:** 2.421 URL, her biri 9-dil + x-default `xhtml:link` (24.210 alternate). Search Console locale dedup için ideal.

⚠️ **Doğrulama gerekli:** İki GSC TXT kaydının ikisi de aktif property mi (domain + URL-prefix), yoksa eski/duplike mi?

**Sonuç:** Indexation kurulumu **neredeyse mükemmel**. Eksik tek şey: indexlenecek içerik (bkz. §3) + auth-page noindex düzeltmesi.

---

## 6. Internal Linking & Site Structure

| # | Alan | Durum | Not |
|---|---|---|---|
| 6.1 | Header nav | ✅ Var | `components/GlatkoHeader.tsx`. |
| 6.2 | Footer | ✅ Var | `components/GlatkoFooter.tsx`. Home'dan 28 unique internal link. |
| 6.3 | Breadcrumb | ⚠️ Kısmen | `components/seo/Breadcrumb.tsx` var (BreadcrumbList schema) ama sadece `services/[slug]` (+ dashboard/admin). Public sayfaların çoğunda yok. |
| 6.4 | İçerikten içeriğe link | ❌ ~Yok | İçerik olmadığı için blog/guide cross-link yok. |
| 6.5 | Orphan riski | ⚠️ Kısmen | Home sadece **4/15** hizmet kategorisine link veriyor; geri kalanı yalnız `/services` üzerinden. |

**Home'dan linklenen (28):** blog + 1 post, 4 hizmet kategorisi (beauty-wellness, boat-services, home-cleaning, renovation-construction), `/services`, `/providers`, `/become-a-pro`, `/request-service`, `/contact`, `/about`, legal sayfalar, login.

**Bulgular:**
- Home'da **tüm hizmet kategorilerine** (15) link → crawl derinliği + kategori sayfası otoritesi.
- Breadcrumb'ı tüm public sayfalara yay (services list, about, how-it-works, blog post).
- `/tr/providers` linki var ama route listesinde `/providers` index page yok (`/pros/[slug]` + `/provider/[id]` mevcut). ⚠️ Bu linkin hedefini teyit et (redirect mi, eksik page mi?).

**Sonuç:** İskelet sağlam (header/footer/breadcrumb component'leri mevcut) ama içerik azlığı internal linking'i sığ bırakıyor. İçerik geldikçe hub-and-spoke (kategori → şehir → guide → blog) kurulmalı.

---

## 7. Backlink & External Signals

| # | Alan | Durum | Not |
|---|---|---|---|
| 7.1 | Domain age | ✅ Kesin | **Kayıt 14 Şubat 2026** (Vercel registrar, $15/yıl) → **~3 ay**. whois "2015" sahte (artifact). Yeni domain → authority/index olgunlaşması zaman ister. EK D #3. |
| 7.2 | SSL | ✅ Geçerli | Let's Encrypt R12, geçerli 22 Apr → 21 Jul 2026 (Vercel auto-renew). |
| 7.3 | Security headers | ✅ İyi (1 eksik) | HSTS (2yr, includeSubDomains, **preload**), X-Content-Type nosniff, X-Frame DENY, Referrer-Policy, Permissions-Policy. **CSP yok.** |
| 7.4 | HTTP/2-3 | ✅ HTTP/2 | curl HTTP/2 negotiate etti. HTTP/3 muhtemelen Vercel'de aktif (curl test etmedi). |

**Bulgular:**
- **CSP eksik (🟡):** `Content-Security-Policy` header yok. Doğrudan ranking faktörü değil ama güvenlik best-practice; GTM/Pixel/Mapbox/Sanity nedeniyle dikkatli policy gerekir.
- Backlink profili bu taramada ölçülemez (Ahrefs/SEMrush/GSC Links raporu gerekir). ⚠️ Off-page analiz harici araç ister.

⚠️ **Doğrulama gerekli:** Gerçek domain registration tarihi (Google Domains/registrar paneli). Domain yaşı sıralama beklentisini etkiler — yeni domain ise "sandbox" sabrı gerekir.

**Sonuç:** Transport/güvenlik sağlam. CSP eklenebilir. Off-page sinyaller bu audit kapsamı dışında — ayrı backlink analizi gerekir.

---

## 8. Öncelik Matrisi

| Bulgu | Etki | Efor | Aciliyet | Sprint |
|---|---|---|---|---|
| Şehir × hizmet programatik landing page'leri yok | 10 | 7 | 🔴 Kritik | CONTENT-ENGINE-1 |
| Blog ~boş (içerik üretimi) | 10 | 8 | 🔴 Kritik | CONTENT-ENGINE-1/2 |
| Cost-guide sayfaları yok | 9 | 5 | 🔴 Kritik | CONTENT-ENGINE-1 |
| Tüm route'lar dynamic (static/ISR/PPR yok) | 8 | 6 | 🔴 Kritik | SEO-PERF-1 |
| FAQ hub yok (schema var, içerik yok) | 7 | 4 | 🟡 Önemli | CONTENT-ENGINE-1 |
| Auth sayfaları indexable (`index,follow`) | 6 | 2 | 🟡 Önemli | SEO-FIX-1 |
| Çift provider URL (`/provider/[id]` vs `/pros/[slug]`) | 6 | 3 | 🟡 Önemli | SEO-FIX-1 |
| Canlı CWV doğrulanmadı (PSI quota) | 7 | 1 | 🟡 Önemli | SEO-FIX-1 (Speed Insights'tan çek) |
| become-a-pro 326kB / request-service 320kB bundle | 6 | 5 | 🟡 Önemli | SEO-PERF-1 |
| Home sadece 4/15 kategoriye link | 6 | 2 | 🟡 Önemli | SEO-FIX-1 |
| Breadcrumb public sayfalarda eksik | 5 | 3 | 🟡 Önemli | SEO-FIX-1 |
| Home title brand tekrarı ("Glatko…\| Glatko") | 4 | 1 | 🟡 Önemli | SEO-FIX-1 |
| `/tr/providers` link hedefi belirsiz | 5 | 2 | 🟡 Önemli | SEO-FIX-1 |
| CSP header yok | 4 | 4 | 🟢 İyileştirme | SEO-PERF-1 |
| ME/SR içerik farklılaştırma (cannibalization önlem) | 5 | 4 | 🟢 İyileştirme | CONTENT-ENGINE-2 |
| Dict 1-key parity farkı | 2 | 1 | 🟢 İyileştirme | (housekeeping) |
| `@next/third-parties` v16 ↔ next v14 sürüm uyumu | 3 | 2 | 🟢 İyileştirme | SEO-PERF-1 |
| Sitemap CDN cache yok (`max-age=0`) | 3 | 2 | 🟢 İyileştirme | SEO-PERF-1 |
| Domain reg tarihi teyidi | 3 | 1 | 🟢 İyileştirme | SEO-FIX-1 |

**🔴 Kritik (4):** içerik motoru (3) + static/ISR (1) — bunlar olmadan altyapı boşa.
**🟡 Önemli (9):** hızlı teknik düzeltmeler + bundle + internal linking.
**🟢 İyileştirme (6):** polish.

---

## 9. Önerilen Sprint Sırası

### 1. SEO-FIX-1 — Hızlı Teknik Düzeltmeler (3-4 gün)
Düşük efor, anında kazanç. Kod riski minimal.
- **DoD:** Auth sayfaları (`login/register/forgot/reset` + (auth) grubuna taşı veya layout robots) → `index:false, follow:false`.
- **DoD:** `/provider/[id]` → `/pros/[slug]`'a 301 redirect VEYA `noindex` + canonical; sitemap'te zaten yok.
- **DoD:** Home `generateMetadata` ekle (unique title/description per locale, brand tekrarını kaldır).
- **DoD:** Home'da 15 hizmet kategorisinin tümüne link; `/providers` link hedefi netleştir.
- **DoD:** Breadcrumb'ı public sayfalara (services list, about, how-it-works, blog post) yay.
- **DoD:** Vercel Speed Insights'tan baseline CWV (mobile+desktop LCP/INP/CLS) raporla.
- **DoD:** Domain reg tarihi + 2 GSC TXT kaydı teyidi.

### 2. SEO-PERF-1 — Render & Bundle (1 hafta)
- **DoD:** Public sayfaları (home, services, about, how-it-works, blog) static/ISR veya PPR'a taşı (auth bağımlılığını layout'tan ayır). Build'de bu route'lar `○`/`ISR` görünmeli.
- **DoD:** `become-a-pro` + `request-service` bundle'ını `@next/bundle-analyzer` ile analiz et; framer-motion/mapbox/tsparticles dynamic import → First Load JS <250 kB.
- **DoD:** CSP header (report-only başla) + sitemap CDN cache (`s-maxage`).
- **DoD:** CWV before/after karşılaştırması.

### 3. CONTENT-ENGINE-1 — Programatik İçerik Temeli (2 hafta)
- **DoD:** Şehir × hizmet landing page template'i (`/[locale]/[service]/[city]` veya benzeri) + DB/Sanity besleme. Top 5 şehir (Podgorica, Budva, Kotor, Tivat, Bar) × top hizmetler.
- **DoD:** Cost-guide template + ilk 10 guide ("X Karadağ'da ne kadar?").
- **DoD:** FAQ hub (mevcut FAQPage schema'yı bağla).
- **DoD:** Her yeni sayfa tipi: buildAlternates hreflang + JSON-LD + breadcrumb + sitemap entry.

### 4. CONTENT-ENGINE-2 — Blog & Editöryel (sürekli)
- **DoD:** Haftalık içerik takvimi (ME/EN/RU rotasyonu). İlk 30 makale brief'i (Rohat tarafında planlanacak).
- **DoD:** ME/SR içerik farklılaştırma kuralı (cannibalization önlem).
- **DoD:** İçerikten içeriğe internal link stratejisi (hub-and-spoke).

---

## EK A: Bulunan önemli dosyalar

| Dosya | Rol |
|---|---|
| `lib/seo.ts` | `buildAlternates()`, `SEO_LOCALES`, `hreflangForLocale()` — canonical/hreflang TEK kaynak (Sprint A) |
| `app/sitemap.ts` | Dinamik sitemap (static + kategori + provider + blog × 9 dil) |
| `app/robots.ts` | Dinamik robots.txt |
| `app/layout.tsx` | Root: metadataBase, title template, verification (GSC/Bing/Yandex), font, GTM Consent Mode v2, Analytics, SpeedInsights, MetaPixel |
| `app/[locale]/layout.tsx` | Locale: metadata + alternates + JSON-LD |
| `middleware.ts` | next-intl + Supabase session + rate-limit + IndexNow + hreflang `Link` header |
| `i18n/routing.ts` | Localized pathnames (çevrilmiş slug) |
| `lib/seo/jsonld.ts` | JSON-LD builder'ları |
| `components/seo/Breadcrumb.tsx`, `ProviderSchema.tsx`, `LocalBusinessSchema.tsx` | Schema component'leri |
| `lib/sanity/fetch.ts` | Blog veri kaynağı |
| `app/api/indexnow/route.ts` | IndexNow submit |
| `dictionaries/*.json` (9) | Çeviriler (~1650 leaf-key) |

## EK B: package.json SEO-relevant bağımlılıklar

| Paket | Sürüm | Rol |
|---|---|---|
| `next` | 14.2.15 | App Router, Metadata API |
| `next-intl` | ^4.8.3 | i18n, localized pathnames |
| `next-sanity` / `@sanity/client` / `@sanity/image-url` / `@portabletext/react` | ^12 / ^7 / ^2 / ^6 | Blog CMS |
| `@vercel/analytics` | ^2.0.1 | Traffic analytics |
| `@vercel/speed-insights` | ^2.0.0 | Gerçek RUM Core Web Vitals |
| `@next/third-parties` | ^16.2.6 | GTM/GA optimize yükleme (⚠️ v16 ↔ next v14) |
| `@sentry/nextjs` | ^8.55.0 | Hata izleme |
| `sharp` | ^0.34.5 | Image optimization (build) |
| `@next/bundle-analyzer` | ^16.2.4 | Bundle analiz (dev) |
| `zod` | ^3.25.76 | Şema validasyon |

## EK C: Önerilen ek bağımlılıklar

Stack zaten **büyük ölçüde tam** — kritik eksik paket yok. Opsiyoneller:
- **`schema-dts`** (opsiyonel): JSON-LD için TypeScript tipleri → schema type-safety.
- **PSI/Lighthouse CI** (opsiyonel): CWV regresyonunu CI'da yakalamak (`@lhci/cli`) — ama Vercel Speed Insights zaten RUM veriyor.
- `next-sitemap` **GEREKMEZ** — native `app/sitemap.ts` daha iyi.

---

## 📋 Rohat'a Sorular (manuel kontrol gerektiren)

1. **`site:glatko.app`** → Google'da kaç sayfa indexli? (§5.1 placeholder — sen söyle, doldurayım.)
2. **Canlı CWV:** Vercel Speed Insights dashboard'undan son 28 gün LCP/INP/CLS (mobile + desktop) paylaşır mısın? PSI API kotası doldu; gerçek veri orada.
3. **Domain yaşı:** glatko.app gerçek registration tarihi? (whois 2015 diyor ama `.app` 2018'de açıldı — registrar panelinden teyit.)
4. **Çift provider URL:** `/provider/[id]` (UUID) artık emekliye ayrılıp `/pros/[slug]`'a redirect mi olmalı? (Sitemap'te zaten sadece slug var.)
5. **Blog post sayısı:** Sanity Studio'da kaç yayınlanmış yazı var? (Canlı ~1 görünüyor.)
6. **İçerik önceliği:** İlk hangi pazar/şehir/dil? (ME/EN/RU + hangi şehirler — Podgorica/Budva/Kotor?)
7. **Auth noindex onayı:** login/register/forgot/reset → noindex yapmamı onaylıyor musun? (Önerilen: evet.)
8. **2 GSC TXT kaydı:** ikisi de aktif property mi, yoksa biri eski mi?

---

## EK D: Canlı Doğrulama — Chrome (2026-05-22)

Aşağıdaki noktalar canlı hesaplardan (Google, GSC, Vercel, canlı site) doğrulandı. Salt-okunur; hiçbir ayar değişmedi.

### #1 — Indexation (GSC + Google)
- `site:glatko.app` ≈ **2.660 sonuç**. GSC Page Indexing: **Indexed 2.61K · Not indexed 2.18K** (güncelleme 5/18/26). İndex grafiği **~2 Mayıs 2026** başlıyor → site yeni.
- **Index'lenmeyen 2.18K — 9 neden:**

| Neden | Kaynak | Sayfa |
|---|---|---|
| Page with redirect | Website | **933** |
| Duplicate, Google chose different canonical than user | Google | **607** |
| Duplicate without user-selected canonical | Website | **366** |
| Not found (404) | Website | 77 |
| Blocked by robots.txt | Website | 20 |
| Alternate page with proper canonical tag | Website | 16 |
| Excluded by 'noindex' tag | Website | 13 |
| Crawled - currently not indexed | Google | 103 |
| Discovered - currently not indexed | Google | 48 |

→ İndex'lenmeyenin **~%87'si redirect (933) + duplicate (607+366=973)** = teknik/canonical, **içerik kalitesi değil**. `/provider/[id]` ↔ `/pros/[slug]` dup'ı "Google chose different canonical = **607**" ile kanıtlandı. **77 adet 404** → kırık link/stale sitemap entry, düzeltilmeli. → SEO-FIX-1'in ROI'si en yüksek.

### #2 — Core Web Vitals: VERİ YOK (3 kaynak)
- **Vercel Speed Insights:** "No data collected yet" — `<SpeedInsights/>` mount ama dashboard'da **enable değil/veri yok**.
- **GSC CrUX:** mobile + desktop "son 90 günde yeterli kullanım verisi yok".
- **PSI API:** 429 kota (key yok).
- → Yeni/düşük-trafik → field-CWV eşiği yok. Aksiyon: (1) Vercel'de Speed Insights enable, (2) trafik arttıkça CrUX dolar, (3) şimdilik lab (Lighthouse) CWV. ⚠️ Ekrandaki demo sayıları (RES 96, FCP 1.55s, LCP 2.55s) Vercel örnek verisi — glatko'nun DEĞİL.

### #3 — Domain yaşı: KESİN
- **glatko.app: kayıt 14 Şubat 2026** (registrar **Vercel**, $15/yıl, expires/auto-renew Feb 14 2027). Bugün ~**3 ay 1 hafta**. whois "2015-06-25" sahte (registry artifact). → Yeni domain: backlink/authority + indexation olgunlaşması zaman ister; agresif sıralama beklentisi gerçekçi değil.

### #5 — Blog: 1 yayın
- Canlı `/tr/blog`: **1 yayınlanmış yazı** — "Karadağ'da Yat Temizliği: 2026 Boka Körfezi Rehberi" (Glatko Editorial, **09.05.2026**). Cost-guide şablonu olarak iyi örnek (CONTENT-ENGINE'de çoğalt).
- `glatko.app/studio` → middleware `/tr/studio`'ya çevirip **404**. Studio glatko.app'te host'lu değil (muhtemelen `*.sanity.studio`). ⚠️ Branded 404 HTTP 200 dönüyorsa soft-404 (77 "Not found" bucket'ıyla ilişkili olabilir) — status teyit et.

### #8 — GSC properties: glatko'da 1
- Glatko: **tek property `glatko.app` (Domain property)**, aktif. Hesapta ayrıca FIJAKA.COM (domain + 8 URL-prefix: ar/de/en/it/me/ru/tr/uk) + RONALEGAL.COM grupları var — glatko değil.
- §5.2'deki 2 DNS TXT'ten yalnız 1'i bu aktif property'ye karşılık geliyor; 2.'si orphan/eski. → Temizle/teyit et. **Öneri:** fijaka gibi per-locale URL-prefix property ekle → 9 dilin segment'li performansı GSC'de ayrı görünür.

### Açık karar (kullanıcı)
- Vercel'de Speed Insights enable edilsin mi? (RUM CWV için şart; ayar değişikliği → Claude tıklamadı.)

---

*Audit tamamlandı — read-only, kod/DB değişikliği yok. Rapor: `docs/seo/seo-audit-baseline-2026-05-22.md`. Canlı doğrulama eklendi: EK D (Chrome, 2026-05-22).*
