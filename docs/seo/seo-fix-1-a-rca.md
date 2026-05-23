# SEO-FIX-1 / İş A — Mini-RCA (Görev A0)

> **Tarih:** 2026-05-23 · **Yöntem:** read-only SQL, glatko-prod (`cjqappdfyxgytdyeytwv`). KOD YOK.
> **Strateji:** Hibrit kademeli rollout. **Phase 1 (bu sprint): sadece sitemap-exclude, NOINDEX YOK.** Phase 2 (noindex) → SEO-FIX-2, 3 hafta sonra GSC verisiyle.
> **Onay bekliyor:** Bu RCA onaylanmadan A1 koduna geçilmez.

## ⚠️ Schema düzeltmesi (brief'teki SQL'ler bu olmadan hata verirdi)
Brief `glatko_pro_services.status = 'approved'` varsayıyordu — **o kolon YOK**. `glatko_pro_services` yalnız `category_id` + `professional_id` (uuid) içerir. **Approval sinyali `glatko_professional_profiles`'ta:** `verification_status = 'approved'` + `is_active = true`. Tüm A0 sorguları + A1 eşiği bu profile-join'i kullanır.

```sql
-- "approved provider" tanımı (tek kaynak):
JOIN glatko_professional_profiles pp ON pp.id = ps.professional_id
WHERE pp.verification_status = 'approved' AND pp.is_active = true
```

## A0.1 — 5 boş root kategori (provider yok, self + alt-kategoriler)
`airbnb-management`, `automotive`, `events-wedding`, `garden-pool`, `repair-service`

→ Hepsi **ikincil niş**. Stratejik root'lar (home-cleaning, boat-services, renovation, beauty-wellness) provider'lı. **Hipotez doğrulandı.** Bu 5'i de root-kuralıyla sitemap'te KALACAK; **content-priority listesi** için işaretle (CONTENT-ENGINE'de editöryel + provider hedefi).

## A0.2 — Editöryel description'lı 2 kategori
| slug | en_len | tr_len | me_len | içerik |
|---|---|---|---|---|
| custom-furniture | 106 | 95 | 101 | "Bespoke, free-standing furniture: tables, dressers, wardrobes, sofas — built to your dimensions and style." |
| furniture-restoration | 125 | 101 | 135 | "Refinishing and repair of old, antique or damaged furniture: polishing, reupholstery, structural repair…" |

→ **Gerçek editöryel** (spesifik, cümle yapılı; placeholder/generic değil), ama kısa (~100-135). >300 eşiği bunları yanlışlıkla dışlar → **eşik `>100` doğru/korunur**. Not: ikisinin de zaten approved provider'ı var (A0.3'te `editorial_only=0`), yani editöryel kol şu an pratik etki yapmıyor ama future-proof (CONTENT-ENGINE provider'sız subcat'lere açıklama ekledikçe otomatik dahil olurlar).

## A0.3 — Approved-filtreli sitemap-include hacmi
| metrik | değer |
|---|---|
| total kategori | 236 (15 root + 221 subcat) |
| roots (hepsi kalır) | 15 |
| subcats_with_provider | 58 |
| subcats_editorial_only | 0 |
| **subcats_kept** | **58** |
| **would_exclude (boş subcat)** | **163** |
| **total_kept** | **73** |

> ⚠️ İlk denemede `would_exclude=0` çıktı — NULL-logic bug'ı: `length(NULL) > 100 = NULL` (üç-değerli mantık) → filter NULL döndü. `coalesce(length(...),0)` ile düzeltildi. Doğru sayı **163**.

**Sitemap projeksiyonu (Phase 1):**
- Kategori URL'leri: 236×9 = 2.124 → **73×9 = 657** (−1.467)
- Toplam sitemap: **2.421 → ~954** → beklenen **700-1100 ✓**, 600 tabanı üstünde ✓. STOP tetiklenmedi.

## ✅ Final eşik formülü (A1 sitemap-include kuralı)
```
include_in_sitemap = isRoot
                     OR approvedProviderCount(rollup) ≥ 1
                     OR maxLocaleDescLen > 100
```
- **isRoot:** `parent_id IS NULL` → 15 root her zaman dahil.
- **approvedProviderCount(rollup):** `getCategoryWithStats` gibi root'lar alt-kategorilerin approved+active provider'ını roll-up sayar. **approval = profile-join** (junction status kolonu yok).
- **maxLocaleDescLen > 100:** en/tr/me (veya herhangi locale) açıklaması > 100 char.

## A1 implementasyon notları (onay sonrası)
1. **Tek aggregate query** — N+1 yok. Root rollup + approved-join'i tek sorguda yap.
2. **localizedUrl** helper'ı (İş B, `lib/seo.ts`) kullan — yeni URL building yazma.
3. `revalidate: 3600` korunur; route key değişmez (içerik değişir).
4. Sadece dahil edilen kategoriler için 9-dil + x-default alternate emit edilir (yapı değişmez).
5. NOINDEX YOK (Phase 2).

## A0.4 — Root rollup kalite kapısı ✓ (tutarlı)
15 root × {root_direct, has_active_subcat, subcat_total/with_provider}:
- **Boş (root_direct=F & has_active_subcat=F):** airbnb-management (17/0), automotive (20/0), events-wedding (11/0), garden-pool (11/0), repair-service (5/0) → **A0.1 ile aynı 5 slug ✓**
- **Dolu (10):** beauty-wellness (15/6), boat-services (15/6), catering-food (17/4, root-direct), childcare-family (16/3), health-wellness (10/1), home-cleaning (15/8), moving-transport (17/8), photo-video (10/3), renovation-construction (25/17, root-direct), tutoring-education (17/2)
- **home-cleaning: has_active_subcat=TRUE (8 subcat provider'lı)** → "13 Fachleute" rollup'ı doğru, bug DEĞİL ✓
→ Tutarlı (Rohat onayı: kapı tutarlıysa ek onaysız A1'e geç). A1 implementasyonuna geçildi.

---
*Görev A0 tamam — read-only, kod/branch değişikliği yok. A0.4 kalite kapısı tutarlı → A1 (sitemap exclude) → A2 (breadcrumb localize).*
