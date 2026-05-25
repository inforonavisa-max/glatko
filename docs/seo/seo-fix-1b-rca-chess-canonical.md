# SEO-FIX-1b — RCA: chess Canonical Varyantı (`/tr/services/chess`)

> **Tarih:** 2026-05-25 · **Tür:** Root-cause analiz (KOD YOK) · **Süre:** ~15 dk
> **Tetikleyici:** SEO-FIX-1 post-deploy ölçümünde (T+48h) URL Inspection bulgusu — `tr/hizmetler/chess` için **Google-selected canonical = `tr/services/chess`** (`/hizmetler/` lokalize segment yerine `/services/` İngilizce segment). Bkz. `gsc-baseline-post-fix-1-2026-05-25.md` §4 (S2).
> **Soru:** `/tr/services/chess` canlı bir duplicate mı, yoksa Google'ın stale/cached görüntüsü mü?

---

## Sonuç (TL;DR)

✅ **SENARYO B — Benign. Aksiyon GEREKMİYOR.** `/tr/services/chess` kalıcı (308) redirect ile `/tr/hizmetler/chess`'e gidiyor. Canlı duplicate YOK. Google sadece stale cache tutuyor; re-crawl edip 308'i takip ettiğinde canonical kendiliğinden `/tr/hizmetler/chess`'e konsolide olacak. **SEO-FIX-1b'ye yeni görev eklenmiyor.**

---

## 4 Kontrolün Sonucu

### 0.1 / 0.2 — `/tr/services/chess` erişilebilir mi? (redirect chain)
```
$ curl -sIL https://glatko.app/tr/services/chess
HTTP/2 308
location: /tr/hizmetler/chess
HTTP/2 200
```
- **Sonuç: SENARYO B (308 permanent redirect).**
- **Hop sayısı: 1** (tek redirect).
- **Final URL: `/tr/hizmetler/chess` → HTTP 200** (lokalize segment, canlı).
- Yani `/services/` İngilizce-segment varyantı, lokalize `/hizmetler/` segmentine **kalıcı** olarak yönleniyor. Duplicate content riski YOK — 308 Google'a "kalıcı taşındı, canonical hedeftir" sinyali verir.

### 0.3 — Sitemap'te var mı?
```
/tr/services/chess  : 0   ✅ (beklenen)
/tr/hizmetler/chess : 0       (boş niş — Phase 1'de sitemap'ten çıkarıldı)
```
- `/tr/services/chess` sitemap'te **yok** (0) — beklenen.
- `/tr/hizmetler/chess` de sitemap'te **yok** (0) — chess boş bir niş olduğu için Phase 1'de zaten çıkarılmıştı (SEO-FIX-1 ölçümündeki "No referring sitemaps detected" bulgusuyla tutarlı). Yani Google bu URL'i sitemap'ten değil, eski crawl'dan/internal'dan biliyor.

### 0.4 — Internal link tutarsızlığı (`/{lokalize-locale}/services/`)
```
/tr/services/  : 1 hit  → lib/seo/indexnow.ts:17   (JSDoc ÖRNEĞİ, gerçek link değil)
/de/services/  : 2 hit  → lib/seo.ts:38, lib/seo.ts:93   (redirect davranışını AÇIKLAYAN yorum)
/ar/services/  : 0 hit
```
- **Gerçek internal link YOK.** Bulunan 3 eşleşmenin tamamı **doküman/yorum** satırı:
  - `lib/seo/indexnow.ts:17` → fonksiyon JSDoc'unda örnek argüman.
  - `lib/seo.ts:38,93` → "`/de/services/[slug]` → `/de/dienstleistungen/<slug>` otomatik 307/308 redirect olur" diye redirect mantığını **anlatan** yorumlar.
- Sprint A'nın segment lokalizasyonu **sağlam**: kod hiçbir yerde lokalize-locale + `/services/` segmenti içeren link ÜRETMİYOR. (Yalnızca `/en/services/` legaldir; o da grep dışı.)

---

## Yorum — Google neden `/tr/services/chess`'i canonical seçti?

`lib/seo.ts` yorumlarının açıkladığı mimari: generic `/{locale}/services/[slug]` rotası, lokalize segmente (`/hizmetler/`, `/dienstleistungen/` …) **307/308 redirect** ediyor. Sprint A öncesi Google `/tr/services/chess`'i (generic form) görmüş ve chess içeriği için canonical olarak seçmiş. Bu URL'in **last crawl tarihi May 10** (Sprint A May 18 ve SEO-FIX-1 May 23'ten ÖNCE) — yani Google'ın elindeki kayıt redirect eklenmeden önceki haline ait.

Google `/tr/services/chess`'i yeniden crawl ettiğinde 308'i görecek; redirect eden bir URL canonical olamayacağı için canonical'ı 200 dönen `/tr/hizmetler/chess`'e taşıyacak. Bu **kendiliğinden düzelen** bir durum.

> Ek not: `/tr/hizmetler/chess` boş niş olduğu için sitemap'te değil ve muhtemelen indexlenmeyecek (zaten "Duplicate without user-selected canonical" kovasında). Bu beklenen ve istenen davranış — boş niş sayfaların indexlenmemesi Phase 1 hedefiydi.

---

## Aksiyon Önerisi

| Senaryo | Durum | Aksiyon |
|---|---|---|
| A) 200 (canlı dup) | ❌ değil | — |
| **B) 308 redirect** | ✅ **BU** | **Aksiyon yok.** Google re-crawl bekleniyor. T+7/T+21 ölçümünde canonical'ın `/tr/hizmetler/chess`'e taşınıp taşınmadığı izlenecek. |
| C) 404 (ölü) | ❌ değil | — |

- **SEO-FIX-1b kapsamı DEĞİŞMİYOR** — yeni görev eklenmedi, hard-stop tetiklenmedi.
- **İzleme:** T+7 (2026-06-01) URL Inspection'da `/tr/hizmetler/chess` → Google-selected canonical'ın `/tr/services/chess`'ten `/tr/hizmetler/chess`'e (veya self'e) dönmesi beklenir. Dönmezse re-crawl gecikmesi; T+21'de tekrar bak.
- **İsteğe bağlı hızlandırma (opsiyonel, bu sprint'te DEĞİL):** `/tr/hizmetler/chess` için URL Inspection → "Request indexing" ile re-crawl tetiklenebilir; ama boş niş olduğu için düşük öncelik.

---

### Kontrol komutları (tekrar üretmek için)
```bash
curl -sIL https://glatko.app/tr/services/chess 2>&1 | grep -iE "^(HTTP|Location)"
curl -s https://glatko.app/sitemap.xml | grep -c '/tr/services/chess'
grep -rn '/tr/services/' app/ components/ lib/   # → sadece yorum satırları
```
