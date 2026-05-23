# SEO-FIX-1 — Root Cause Analysis (Görev 0)

> **Tarih:** 2026-05-23 · **Yöntem:** GSC Page Indexing drilldown (canlı, Chrome) + `curl -IL` doğrulama + kod grep. **KOD DEĞİŞMEDİ.**
> **Kapsam:** Index'lenmeyen 2.18K sayfanın 4 ana bucket'ı (redirect 933, dup 607+366, 404 77) için gerçek örnek URL + kök neden.
> **Onay bekliyor:** Bu RCA Rohat tarafından onaylanmadan Görev 1+ (kod) başlamaz (brief kuralı #3).

---

## ⚠️ Yönetici Özeti — Brief'in 3 varsayımı veriyle ÇÜRÜDÜ

| Brief varsayımı | Gerçek (GSC örnekleri) | Sonuç |
|---|---|---|
| **Görev 1:** 607 = `/provider/[id]` ↔ `/pros/[slug]` dup | 607 örneklerinin **HİÇBİRİ** provider değil → hepsi **ince servis alt-kategori** sayfası | Provider redirect **gereksiz** — mevcut canonical fix (page.tsx:86-93) zaten çalışıyor |
| **Görev 3:** 366 = canonical eksik route'lar | 366 da **servis alt-kategori** sayfaları (canonical'ları VAR) | Canonical ekleme değil → **ince içerik** sorunu |
| **Görev 4:** 77 404 = eski blog slug'ları | 77'nin hepsi **`/opengraph-image` URL'leri** (non-localized `/services/`) | Blog değil → OG-image/locale-segment sorunu |

**Gerçek tablo:** İndex'lenmeyenin baskın kısmı **iki kök nedene** iniyor:
1. **İnce servis alt-kategori sayfaları (607+366 = ~973)** → en büyük kaldıraç. İçerik/indexation-stratejisi sorunu.
2. **Non-localized `/services/` path segment (933 redirect + 77 404 = ~1.010)** → kısmen aktif kod bug'ı (BreadcrumbList JSON-LD), kısmen eski URL.

---

## Bucket 1 — Page with redirect (933) 🔴

**GSC örnekleri (1-10/933):**
```
/me/services/scheduled-service     /de/services/regular-cleaning
/me/services/electrical-renov      /ru/services/nanny-fulltime
/ar/usluge/home-cleaning           /sr/services/bridal-prep
/de/iletisim                       /uk/services/towing
```
**curl doğrulama (tek hop, zincir yok ✓ — ama karışık 307/308):**
```
/me/services/electrical-renov → 308 → /me/usluge/electrical-renov ✓
/de/services/regular-cleaning → 308 → /de/dienstleistungen/regular-cleaning ✓
/de/iletisim                  → 307 → /de/kontakt            ✗ (geçici olmamalı)
/ar/usluge/home-cleaning      → 307 → /ar/al-khadamat/home-cleaning ✗
```
**Kök neden:** Non-localized (`/services/`) veya cross-locale (`/de/iletisim`, `/ar/usluge/`) path segment'leri → next-intl doğru localized slug'a redirect ediyor.
- **AKTİF kaynak (CANLI bug):** `app/[locale]/services/[slug]/page.tsx:178,187,192` — **BreadcrumbList JSON-LD** breadcrumb URL'lerini hardcoded `${SEO_BASE}/${locale}/services/...` ile kuruyor (localize ETMİYOR). Google bu schema URL'lerini crawl ediyor → redirect. (Sitemap doğru: `localizedWithParams` kullanıyor; iç `<Link>`'ler de doğru: `pathname` objesi.)
- **Pasif kaynak:** localized-pathname öncesi eski `/services/` URL'leri (Google hafızası) — re-crawl'da düşer.

**Önerilen fix:**
1. `services/[slug]/page.tsx` BreadcrumbList URL'lerini `localizedWithParams(locale, "/services/[slug]", …)` ile üret (sitemap.ts:132 paterni). → 933'ün aktif kaynağını kapatır.
2. Tüm locale-mismatch redirect'leri **308** yap (307'ler kalıcı olsun) → Google sinyal konsolide etsin.
**Etki:** Orta-yüksek. **Efor:** Düşük (schema URL fix). **Aciliyet:** 🟡 (redirect zararsız ama crawl bütçesi + sinyal dağılması).

---

## Bucket 2 — Duplicate (607 + 366 = ~973) 🔴 EN BÜYÜK KALDIRAÇ

**607 "Google chose different canonical" örnekleri:**
```
/me/usluge/plumbing-renov   /tr/hizmetler/lawn-mowing   /ar/al-khadamat/chess
/tr/hizmetler/makeup        /ar/al-khadamat/towing      /ar/al-khadamat/after-party
```
**366 "Duplicate without user-selected canonical" örnekleri:**
```
/tr/hizmetler/animator      /ar/al-khadamat/insulation     /it/servizi/furniture-restoration
/ar/al-khadamat/tile-ceramic /ar/al-khadamat/airbnb-turnover /de/dienstleistungen/preschool-prep
```
**curl doğrulama (607):** Sayfalar **SELF-canonical** ilan ediyor (`/tr/hizmetler/makeup` → kendine), 148-162KB HTML, h1 = localized kategori adı ("Makyaj", "Vodoinstalacija", "الشطرنج").

**Kök neden:** Bunların **hepsi servis alt-kategori sayfaları** (niş kategoriler: chess, animator, makeup, towing, insulation, airbnb-turnover, preschool-prep…) × 9 dil. Şablon aynı, benzersiz metin az, muhtemelen **boş/az provider listesi**. Google ince+near-dup içerik → dedup (607 = canonical'ı override, 366 = canonical'ı saymadı; **ikisi de aynı kök**). `/provider/[id]` **bu bucket'larda YOK** → provider canonical fix çalışıyor.

**Önerilen fix (sıra):**
1. **Indexation stratejisi (hızlı, en yüksek ROI):** ≥N provider'ı VEYA benzersiz içeriği olmayan alt-kategorileri `robots: { index:false }` ile noindex et (dinamik: provider sayısı/içerik eşiğine göre). → ~973 dedup-noise temizlenir, crawl bütçesi gerçek sayfalara gider. **SEO-FIX-1 kapsamında yapılabilir.**
2. **İçerik (uzun vade, CONTENT-ENGINE):** Yaşayan alt-kategorilere benzersiz intro + cost-info + FAQ + provider listesi. noindex'i içerik geldikçe kaldır.

✅ **Doğrulandı (canlı sample, 2026-05-23):**

| Sayfa | provider | görünür kelime |
|---|---|---|
| /tr/hizmetler/home-cleaning | 2 | 6.493 |
| /tr/hizmetler/boat-services | 2 | 6.607 |
| /tr/hizmetler/makeup | 0 | 4.797 |
| /tr/hizmetler/chess | 0 | 4.797 |
| /tr/hizmetler/animator | 0 | 4.801 |

makeup ↔ chess **birebir aynı kelime sayısı (4797)** → h1 dışında byte-identical şablon. 0-provider sayfaları boilerplate dışında benzersiz içerik taşımıyor → dedup sebebi tam bu.

**Net eşik (karar):** Alt-kategori sayfası indexlenebilir IFF `provider_count ≥ 1` **VEYA** editöryel açıklama var. Aksi halde `robots:{index:false}` **+ sitemap'ten çıkar** (`app/sitemap.ts` şu an boş alt-kategorileri de yayınlıyor → iki taraflı fix). Sayfa kullanıcıya erişilebilir kalır; provider eklendiğinde otomatik index'e döner.
**Etki:** Çok yüksek (index kalitesi + crawl bütçesi). **Efor:** Orta (sayfada provider sayısı zaten server-side biliniyor). **Aciliyet:** 🔴.

---

## Bucket 3 — Not found 404 (77) 🟡

**GSC örnekleri — hepsi aynı pattern:**
```
/uk/services/family-counselor/opengraph-image?73e08e63c163852e
/me/services/engagement-henna/opengraph-image?73e08e63c163852e
/it/services/maintenance/opengraph-image?73e08e63c163852e
/sr/services/winter-storage/opengraph-image?73e08e63c163852e
```
**Kök neden:** Tümü **`/[locale]/services/[slug]/opengraph-image`** (non-localized `/services/` segment + OG-image alt-route) → 404. 933 ile **aynı kök** (non-localized segment), ama image route'u redirect yerine 404 veriyor. OG-image route dosyası `app/[locale]/services/[slug]/opengraph-image.tsx` mevcut (localized path'te çalışıyor); non-localized varyant 404. robots.txt `/*/opengraph-image*` disallow ediyor ama bunlar 404 bucket'ında (Google robots'tan önce/ayrı keşfetmiş).

**Önerilen fix:** 933 breadcrumb fix'i bunların yeni üretimini büyük ölçüde durdurur. Ek: OG-image URL'lerinin localized path kullandığını teyit et; gerekirse `/services/[slug]/page.tsx` openGraph.images'ı açıkça localized path'e bağla. Mevcut 77 re-crawl'da düşer.
**Etki:** Düşük (77, zararsız). **Efor:** Düşük. **Aciliyet:** 🟢 (self-resolving + breadcrumb fix'e bağlı).

---

## Bucket 4 — Küçük/kabul edilebilir bucket'lar (✅ aksiyon yok)
- **Blocked by robots.txt (20):** kasıtlı (admin/dashboard vb.).
- **Excluded by 'noindex' (13):** kasıtlı.
- **Alternate page with proper canonical (16):** sağlıklı hreflang davranışı.
- **Crawled/Discovered - not indexed (103+48):** yeni site + ince içerik → authority/içerik arttıkça düzelir.

---

## REVİZE ÖNCELİK (RCA sonrası)

| # | İş | Bucket | Etki | Efor | Aciliyet |
|---|---|---|---|---|---|
| **A** | Thin alt-kategori sayfalarını eşiğe göre **noindex** | 607+366 (973) | 10 | 5 | 🔴 |
| **B** | BreadcrumbList JSON-LD → localized URL | 933 | 7 | 2 | 🟡 |
| **C** | Locale-mismatch redirect'leri 308 yap | 933 | 5 | 3 | 🟡 |
| **D** | Auth sayfaları noindex (login indexli — `/prijava` site:'de çıktı) | — | 6 | 2 | 🟡 |
| **E** | OG-image URL localized teyit | 77 | 3 | 2 | 🟢 |
| **F** | Home `generateMetadata` + brand tekrarı | — | 4 | 1 | 🟡 |
| **G** | Internal linking (home→15 kategori, breadcrumb yayılımı, `/providers` link) | — | 5 | 2 | 🟡 |
| **H** | Sitemap CDN cache (`s-maxage`) | — | 3 | 2 | 🟢 |
| ~~Görev 1~~ | ~~/provider/[id] 301 redirect~~ | — | — | — | ❌ **İPTAL** (607 provider değil; canonical fix çalışıyor) |

**Tek cümle:** En büyük kazanç **thin alt-kategori noindex'i (A)** + **breadcrumb schema fix'i (B)**. Provider redirect (eski Görev 1) gereksiz.

---

## Rohat'a sorular (kod öncesi)
1. ✅ **noindex eşiği (iş A) — ÇÖZÜLDÜ (sample sonrası):** `provider_count ≥ 1` VEYA editöryel açıklama → index; yoksa noindex + sitemap'ten çıkar. (Rohat onayladı: "önce sample incele" → eşik veriyle belirlendi.)
2. **Branch zemini:** Local `main` stale (`41124ef`, Sprint A öncesi); kod `origin/main` (`50a5c4f`)'den açılmalı. **Öneri: temiz `seo-fix-1` worktree'si origin/main'den** (audit/RCA dosyaları docs/seo'da kalır). Onaylıyor musun?
3. **GSC tam export (opsiyonel):** Drilldown'lardan örnekleri ben okudum; tam 150-URL CSV gerekiyorsa "Export" ile sen alabilirsin — ama pattern'ler net, gerek görmüyorum.

---

*Görev 0 (RCA) tamam — read-only, kod/branch yok. Onayında Görev A-H (revize) için branch açma izni isteyeceğim.*
