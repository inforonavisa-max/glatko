# Glatko Master SEO Plan v1

**Tarih:** 8 Haziran 2026
**Hazırlayan:** Rohat Kahraman + Claude
**Durum:** Living document — sprint kararlarıyla güncellenir
**Repo path:** `docs/seo/glatko-master-seo-plan-v1.md`
**Versiyon:** v1.3 (9 Haziran 2026 — Defer-8 G-FOUNDING-RESTRATEGIZE)

---

## İçindekiler

- [BÖLÜM A — Durum Değerlendirmesi](#bölüm-a--durum-değerlendirmesi)
- [BÖLÜM B — 5 Cephe Stratejisi](#bölüm-b--5-cephe-stratejisi)
- [BÖLÜM C — Operasyon](#bölüm-c--operasyon)
- [BÖLÜM D — Açık Konular](#bölüm-d--açık-konular)
- [BÖLÜM E — Memory & Workflow Rules](#bölüm-e--memory--workflow-rules)

---

## BÖLÜM A — Durum Değerlendirmesi

### A1. Glatko bugün nerede

**Platform:** Glatko.app — Karadağ için **reverse service marketplace** (Armut/Thumbtack modeli). Müşteri talep gönderir, çoklu provider teklif verir.

**Tech stack:** Next.js 14 App Router, TypeScript strict, Supabase (Frankfurt, `cjqappdfyxgytdyeytwv`), Tailwind, Vercel, Sanity (post-launch için bekletilen), Resend, Infobip, Mapbox.

**Provider havuzu (8 Haziran 2026 itibarıyla):**

- **25 toplam provider** sitemap'te (`glatko_professional_profiles` tablosunda)
- **19 founding provider** (founding_provider_number 1-19)
- **6 non-founding active provider**
- Coverage: 9 Podgorica, 8 Budva, 2 Kotor, 2 Bar, 1 Niksic, 1 Tivat, 1 Herceg Novi
- **8 Türk diaspora provider (%32)** — organik bir veri noktası

**Lokalizasyon:** 9 dil active — `ar / de / en / it / me / ru / sr / tr / uk`

- Arapça var (RTL handling gerekli), Fransızca yok
- Provider içeriği (bio, services) **locale-neutral** — 9 dile ayrı çevrilmedi
- Strateji: `/me` master canonical (geçici), G-PROVIDER-I18N sprint sonrası (M3-M4) per-locale self-canonical'a geçiş

**SEO altyapısı (tamamlanmış):**

- ✅ Hreflang 10 head / 0 body (Next.js bug yok)
- ✅ Sitemap dynamic (force-dynamic, ~225 provider URL, 1017 toplam)
- ✅ IndexNow live (`9cbde601290d1aa5a43c53b935f9e433`, 216 URL pushed)
- ✅ GSC + Bing + Yandex verified, sitemap submitted
- ✅ AI crawler allowlist + llms.txt
- ✅ Provider canonical fix (PR #76, G-CANONICAL-FIX)
- ✅ Provider 404 P0 fix (PR #92, RPC + redirect)

**Performance (lab Lighthouse, post-1B):**

- Homepage: Score 78, LCP 5.7s
- Provider: Score 78, LCP 5.7s
- Category: Score 81, LCP 4.7s
- ⚠️ Field data yok (Vercel Speed Insights aktive edilmedi, CrUX trafiği yetersiz)
- ⚠️ Lab variance ±13 puan tek-run spread

**Launch durumu:** Rolling launch via milestone waves — formal "launch day" yok. Platform zaten live, milestone-based announcement strategy.

### A2. BrziMajstor — gerçek rakip

Önceki varsayım (master plan v0 zihni): "majstore.me dormant, tvojmajstor.me dead, samoruke.me construction-only" — **eskimiş.**

**Gerçek rakip:** **BrziMajstor.me**

- 725 SR-only programmatic page
- 80+ "founding provider" seeded
- 15 kategori × ~25 şehir kombinasyonu
- Tech: Next.js + Supabase (ref `nrmhaguytggzkrroflxn`)

**Tehdit seviyesi: MEDIUM-LOW (önceden HIGH sanılıyordu).**

Sebepler:

| Faktör | BrziMajstor | Glatko |
|---|---|---|
| Provider sayısı | 80+ | 25 |
| **Gerçek review** | **0** | 0 (henüz) ama gerçek transaction var (Scott Newland case) |
| Response time | Bucketed placeholder ("~10 min") | Real-time pipeline (Infobip) |
| Locale coverage | SR only | 9 dil + RTL |
| Programmatic SEO | 725 sayfa | 111 sayfa (gap kapatılacak) |
| Tech moat | Standard stack | Standard stack |
| **Social presence** | **Yok** | Instagram + ambassador (Scott) |
| **PR / brand** | Yok | RoNa Legal backing, Helena outreach |
| **Konsumacı yolu** | Live ama trafik yok | Live ama trafik yok |

**Strategic insight:** BrziMajstor **"content moat" var, "network moat" yok.** Glatko'nun stratejisi tersine — başlangıçta content gap'i kabul edip **gerçek network etkisi** (review + transaction) ile fark yaratmak. 50 gerçek review BrziMajstor'un 80 "ghost provider"ından daha değerlidir.

### A3. Pazarın yapısı

**Karadağ yerli pazarı:**

- Nüfus: ~620K, internet penetration yüksek
- Karadağca/Sırpça primary, Karadağca SEO competition düşük
- Yandex penetration: Düşük-orta (Russian expat community)
- Google: Dominant
- Bing: Marjinal ama IndexNow aktif

**Diaspora segment'leri (9 locale stratejisi içinde, vertical değil):**

- **Türk diaspora** — organic Glatko penetration %32 (8/25 provider). Türkçe locale eşit muamele görür.
- **Rus expat community** — Porto Montenegro/Budva yoğun. Russian locale active.
- **Sırp expat** — Crna Gora dışı (Sırbistan, Bosna). SR locale active.
- **Ukrayna expat** — Karadağ'a önemli akış 2022 sonrası. UK locale active.

**Yabancı turist + investor:**

- EN, DE, IT locale'leri için real estate + service decision-maker pazarı
- Brand kalite signal: Aceternity UI, premium design

**Pazar fırsatı vs BrziMajstor:**

- BrziMajstor SR-only → 1 locale × 725 sayfa = 725 search surface
- Glatko 9 locale × 200 unique = 1800 sayfa target = 2.5× BrziMajstor genişliği
- **Bu yarış "eşit yarış" değil, "paralel yarış"** — Glatko'nun ulaştığı locale'ler BrziMajstor'a kapalı

---

## BÖLÜM B — 5 Cephe Stratejisi

### Cephe 1: Provider Canonical & Technical SEO

**Durum:** ✅ **Büyük ölçüde tamamlandı**

**Mevcut durum:**

- Provider canonical fix yapıldı (G-CANONICAL-FIX, PR #76) — `/me` master canonical
- Provider 404 P0 bug çözüldü (G-PROVIDER-ROUTE-CLEANUP, PR #92)
  - `glatko_search` RPC slug fix prod'da canlı
  - `/provider/[id]` → `/pros/[slug]` soft redirect canlı
  - Migration `058` repo'da kayıt altında
- Hreflang 10 head / 0 body perfect
- Sitemap dynamic, 225 provider URL, IndexNow integrated

**Açık kalan minor sorunlar:**

- Soft redirect (hard 308 değil) — streaming layout yüzünden. SEO için canonical zaten consolidate ediyor, acil değil.
- `sitemap.ts` `revalidate=3600` dead code (force-dynamic override ediyor). Crawler burst yorabilir launch sonrası.

**Long-term roadmap:**

- M3-M4: G-PROVIDER-I18N sprint sonrası provider content 9 dile çevrilince, `/me` master canonical'dan **per-locale self-canonical**'a geçiş (Cephe 1 + Cephe 4 birlikte)
- Migration sprint: G-CANONICAL-MIGRATE-2
- Rollback plan: G-CANONICAL-FIX strategy'sini revert edebilen documented prosedür

**Zafer kriteri:** ✅ Karadağ pazarı için `/me/pros/*` URL'leri Google'da self-canonical olarak indexli + search→provider yolculuğu broken değil. **Hepsi tamam.**

### Cephe 2: CWV Performance

**Durum:** ⏳ **Kısmen tamamlandı, devam ediyor**

**Mevcut performans:**

| Sayfa | Score | LCP | Önceki |
|---|---|---|---|
| Homepage | 78 | 5.7s | 70/9s |
| Provider | 78 | 5.7s | 75/8s |
| Category | 81 | 4.7s | 81/4.8s |

**Tamamlanan sprint'ler:**

- ✅ G-CWV-AUDIT (read-only teşhis raporu)
- ✅ G-CWV-FIX-1A withdrawn (font preload, marginal ROI, technical debt riski)
- ✅ G-CWV-FIX-1B (provider avatar priority, LCP 9s → 5.7s)

**Pause edilen sprint:**

- ⏸️ G-CWV-FIX-1C (third-party JS lazyOnload — GTM/GA4/Meta)
  - **Sebep:** @next/third-parties wrapper refactor gerekir (basit attribute flip değil)
  - Speed Insights yok → field data ile öncesi/sonrası karşılaştırması yapılamaz
  - Lab Lighthouse ±13 puan variance → güvenilmez
  - Conversion tracking riski launch öncesi kabul edilemez
  - **Re-evaluation:** Launch + 2-3 hafta sonra (CrUX data olgunlaşınca)

**Açık RED/YELLOW kalemler (audit):**

- 🔴 LCP hâlâ >2.5s "good" eşiği — 1C ile çözülür
- 🟡 Homepage regression (audit 81 → bugün 61-74, lab variance veya gerçek?)

**Stratejik karar:** BrziMajstor LCP 5.1s — Glatko 5.7s ile **paralel** (gap 0.6s). 1C yapılmadan da yarışta olunabilir. Ama Year 1'de 1C kazancı (LCP 2.5-3s) BrziMajstor'u **net geçer.**

**Aşamalı CWV budget:**

- **Year 1 (launch → +6 ay):** LCP ≤ 3.0s, Score ≥ 78 (mevcut)
- **Year 2 (+6 ay → +12 ay):** LCP ≤ 2.5s, Score ≥ 85 (1C uygulamasıyla)
- **Year 3:** LCP ≤ 2.0s, Score ≥ 90 (G-PERF-3+ ileri optimizasyon)

**Field data measurement gerçeği:**

- Vercel Speed Insights $10/ay — bilinçli ertelendi
- CrUX field data 3-6 ay sonra olgunlaşır (yeterli trafik gerek)
- Bu süreçte **lab data + manual conversion test** primary
- Launch + 2 ay sonra Speed Insights kararı yeniden değerlendirilecek

**Zafer kriteri:** Launch'ta LCP ≤ 5.7s (mevcut), 6 ay içinde ≤ 3.0s. BrziMajstor karşısında **paralel veya önde** her zaman.

### Cephe 3: AEO Content (FAQPage + Question-H2s + Cost Tables)

**Durum:** ⏳ **Başlanmadı, hazır**

**Audit'ten gelen açık kalemler:**

- 🟡 Homepage FAQPage eksik (BrziMajstor'da var)
- 🟡 Question-format H2s eksik ("Boat Cleaning Kotor" → "How much does boat cleaning cost in Kotor?")
- 🟡 Cost-guide table markup yok (`<table>` + `<caption>` semantic HTML)
- 🟡 Meta description length (homepage 100-120 char, sweet spot 150-160)

**Sprint planlanan:**

- **G-AEO-FAQ-HOMEPAGE** (4-6 saat) — Homepage'e FAQPage schema + 8-10 strategic Q&A
- **G-AEO-H2-REWRITE** (3-4 saat) — Top 20 service × city page'inde question-format H2
- **G-AEO-COST-TABLES** (2-3 saat) — 5-10 kategori için cost-guide table markup
- **G-META-DESCRIPTIONS** (1-2 saat) — YELLOW madde fix

**Toplam:** ~10-15 saatlik content + markup sprint serisi

**Neden bu cephe önemli:**

- LLM citation (ChatGPT, Perplexity, Claude.ai) için altın — soru formatı + cost data = citation magnet
- BrziMajstor FAQPage'i var ama 9 dilde değil → Glatko 9 dilde yapınca avantaj
- llms.txt + AI crawler allowlist zaten avantaj — bu cephede 1-1 berabere → 2-1 önde

**Zafer kriteri:** Glatko 9 dilde FAQPage + question-H2 + cost-tables ile **LLM cevaplarında alıntılanan platform** olur. Karadağ "majstor nasıl bulurum" sorusunun **default cevabı.**

### Cephe 4: Content Volume (Programmatic SEO)

**Durum:** ⏳ **Strateji oturuyor, başlanmadı**

**Hedef matriksi:**

```
14 kategori × 8 şehir = 112 base kombinasyonu (service × city)
+ 14 kategori hub
+ 8 şehir hub
+ ~50 cost guide
+ ~10 comparison page (Glatko vs DIY, vs hire-direct, vs competitor)
= ~200 unique sayfa
× 9 locale = 1800 sitemap URL
```

**Karşılaştırma:**

- BrziMajstor: 725 URL (SR only)
- Glatko target: 1800 URL (9 locale)
- **2.5× BrziMajstor'un genişliği**

**Liquidity gate (önemli kural):**

- Service × city sayfası publish edilir **ANCAK** o kombinasyon için liquidity threshold geçerse:
  - **M0-M2:** ≥ 3 provider (bid criteria henüz aktif değil)
  - **M3+:** ≥ 3 provider VE ≥ 5 historical bid (master plan hedefi)
- Yoksa sayfa "Coming soon" placeholder (noindex)
- Aşamalı threshold gerçek launch + early demand reality'sine uyumlu

**Aşamalı rollout (gerçekçileştirilmiş):**

| Ay | Hedef sayfa | Liquidity status |
|---|---|---|
| M1 (launch ayı) | 25 publish | 8-10 kombinasyon liquid (founding pro coverage) |
| M2 | 40 publish | İlk gerçek customer bid'leri ile genişleme |
| M3 | 80 publish | G-PROVIDER-I18N sonrası 9-locale expansion başlar |
| M6 | 300 publish | 33 kombinasyon × 9 locale |
| M12 | 1000+ publish | 111+ kombinasyon × 9 locale |

**Önceki master plan'da "M2'de 80 sayfa" diyordu — gerçekçi değildi. Yeni rollout 4× daha gerçekçi.**

**Sprint planlanan:**

- **G-PSEO-FOUNDATION** (1 hafta) — Service × city template + liquidity check + 9-locale generation
- **G-PROVIDER-I18N** (3 hafta, M3-M4) — Provider content 9 dile çeviri (gpt-4o, ~$200-400/yıl)
- **G-PSEO-EXPANSION-X** (her ay) — Liquidity reach ettiğinde new combination publish

**Şehir coverage gerçeği:**

- Tivat 1, Kotor 2, Herceg Novi 1, Ulcinj 0 provider — Boka Bay zayıf
- Karar: **Demand-driven coverage** (resmi şehir önceliği yok)
- Opportunistic acquisition (Scott Newland Ulcinj case gibi)

**Zafer kriteri:** Year 1 sonu ~Mayıs 2027) 1000+ unique sayfa × 9 locale, BrziMajstor'un 2.5× genişliği. Sırf sayı değil — **liquidity gate ile gerçek conversion potansiyeli** olan sayfalar.

### Cephe 5: Brand Awareness + Reviews

**Durum:** ⏳ **Helena outreach ile devam**

**BrziMajstor'un en büyük zayıflığı:** 80+ provider, **0 review.**

**Glatko'nun fırsatı:**

- İlk gerçek transaction tamamlandı: **Scott Newland case** (Ulcinj villa, May 30 - Jun 5)
  - Zdravko Popović (plumbing/bathroom)
  - Boris Vlahović (power-washing, kısmi)
  - **Scott voluntary brand ambassador** (Facebook post "Expats in Bar")
- Founding pro network real iş yapıyor (henüz review yazılmadı ama bid'ler aktif)

**Strateji:**

**Aşama 1: İlk 10 review (M1-M2)**

- Scott + Zdravko ekibi → ilk 3-5 review
- Helena → completed job sonrası "review yazar mısın" follow-up (sistemleştir)
- Türk diaspora provider'lar arası referral → 2-3 review
- **Hedef: M2 sonu 10 gerçek review**

**Aşama 2: 50 review havuzu (M3-M6)**

- Sistemli review pipeline: Job completion → 24 saat sonra review request (email + WhatsApp)
- Review incentive (henüz değil — launch + 6 ay sonra değerlendirilecek)
- **Hedef: M6 sonu 50 gerçek review**

**Aşama 3: Network effect başlangıcı (M6+)**

- "BrziMajstor'da 0 review, Glatko'da 50+" → provider acquisition message
- Provider'lar Glatko'ya kayıt olmaya başlar (gerçek transaction kanıtı)
- Self-registration flow + admin approval cadence accelerate

**Helena outreach (devam eden):**

- Memory: 17+ simultaneous targets
- Karadağca/Russian/English multi-locale outreach
- Founding pro slug audit (8 Haziran): 19 founding tamam, 6 non-founding active

**Diaspora outreach (9 dil eşit prensibi içinde):**

- Türk diaspora — Türkçe outreach, "Glatko'da Türk usta var" social proof
- Russian expat — Russian outreach, Yandex Business profili (Y2'de)
- Yerli Karadağlı — Karadağca, "Yerel platform, RoNa Legal backing"

**Zafer kriteri:** M6 sonu 50 gerçek review, BrziMajstor'un 80 "ghost provider"ını **inanılırlık** açısından geçmek. Provider acquisition pasif olarak çalışmaya başlar (search-driven self-registration).

### BÖLÜM B Özet

5 Cephe stratejisi şu an:

| Cephe | Durum | Sonraki major sprint |
|---|---|---|
| 1. Canonical & Technical SEO | ✅ Tamam | G-PROVIDER-I18N (M3-M4) |
| 2. CWV Performance | ⏳ Kısmi | G-CWV-FIX-1C (launch + 2-3 hafta) |
| 3. AEO Content | ⏳ Hazır | G-AEO-FAQ-HOMEPAGE (next sprint candidate) |
| 4. Content Volume | ⏳ Strateji | G-PSEO-FOUNDATION (M2-M3) |
| 5. Brand & Reviews | ⏳ Aktif | Helena outreach + review pipeline |

**Önümüzdeki 3 sprint önerisi (sıralı):**

1. **G-AEO-FAQ-HOMEPAGE** (4-6 saat) — En hızlı ROI, AEO için kritik
2. **G-PSEO-FOUNDATION** (1 hafta) — Content volume cephesinde temel
3. **G-CWV-FIX-1C** (launch sonrası) — Field data olunca

---

## BÖLÜM C — Operasyon

### C1. Sprint Sistem & Kodlama

Glatko'nun **G-prefix sprint kodlama sistemi** stratejik anlayışı kayda alır. Her sprint kategorisi ve isimlendirme convention'ı:

**Sprint kategorileri (cephe bazlı):**

```
G-INDEXING-*    → Cephe 1 (canonical, sitemap, search engine verification)
G-CWV-*         → Cephe 2 (Core Web Vitals, performance)
G-AEO-*         → Cephe 3 (Answer Engine Optimization, FAQ, structured data)
G-PSEO-*        → Cephe 4 (programmatic SEO, content volume)
G-PROVIDER-*    → Cross-cephe (provider onboarding, i18n, route management)
G-ADS-*         → Reklam altyapısı (GTM, GA4, Meta Pixel, conversion tracking)
G-NOTIF-*       → Notification pipeline (email, SMS, WhatsApp)
G-CMS-*         → Sanity blog + content management
G-LAUNCH-*      → Pre-launch polish ve operational readiness
```

**Naming convention:**

```
G-{CATEGORY}-{ACTION}-{IDENTIFIER}

Örnekler:
G-CWV-AUDIT             (audit/teşhis sprint)
G-CWV-FIX-1A            (fix sprint, numbered/lettered)
G-CWV-FIX-1B            (alternatif yol, A withdrawn)
G-CANONICAL-FIX         (tek sprint, identifier yok)
G-PROVIDER-I18N         (büyük feature sprint)
G-PROVIDER-ROUTE-CLEANUP (kalıcı temizlik sprint)
```

**Sprint tipleri:**

| Tip | Açıklama | Süre tahmini |
|---|---|---|
| Audit sprint | Read-only teşhis, rapor üretir, kod değiştirmez | 1-2 saat |
| Fix sprint | Belirlenmiş bug/issue için cerrahi müdahale | 1-4 saat |
| Feature sprint | Yeni özellik veya stratejik bileşen | 4-16 saat |
| Cleanup sprint | Technical debt temizliği, refactor | 2-8 saat |
| Polish sprint | Pre-launch düzenlemeler, fine-tuning | 1-3 saat |

**Sprint yaşam döngüsü:**

```
Claude prompt yaz → Claude Code execute →
Rohat QA (local + preview test) → "APPROVED" →
PR merge → Production deploy → Smoke test →
Memory update → Bir sonraki sprint
```

### C2. Sprint Discipline & Safety Rules

Bu kurallar **kayıp önleme** için. Memory'de yazılı + her sprint prompt'unda tekrarlanmalı.

#### Git safety (asla ihlal edilmeyecek)

- ❌ `git push --force` — **YASAK** (her zaman)
- ❌ `git reset --hard` — **Rohat onayı olmadan YASAK**
- ❌ `git add -A` veya `git add .` — **YASAK** (sadece explicit staging)
- ❌ `.git` directory replacement — **YASAK**
- ❌ Dosya silme — **YASAK** (silmek gerekiyorsa Rohat'a sor)
- ✅ Her risky değişiklik öncesi backup branch oluştur
- ✅ Backup branch'i `backup/pre-{sprint-code}-{timestamp}` formatında
- ✅ Backup branch silinmez (audit trail için)

#### Multi-project safety

- ✅ Sprint başlangıcında `pwd` → workspace doğrula
- ✅ Glatko: `/Users/Shared/dev/glatko-frontend`
- ✅ RoNa Legal: `/Users/Shared/dev/ronalegal`
- ✅ Fijaka: `/Users/Shared/dev/sahibinden_ai/sahibinden-ai-frontend`
- ❌ Bir sprint'te birden fazla projeye dokunma

#### PR merge protocol

```
1. Claude Code PR açar
2. Vercel preview deploy auto
3. STOP — Rohat onayı bekle
4. Rohat local test → "local OK"
5. Rohat preview test → "preview OK"
6. Sadece o zaman merge (squash merge tercih)
7. Working branch sil (local + remote)
8. Backup branch'i KORU
9. Production deploy bekle (~2-3 dk)
10. Production smoke test
```

**Memory Item 8 — yumuşatma riski:**

Bu protocol birkaç sprintte "Rohat'ın açık onayı ile esnetildi". Bu pattern dikkat gerektirir. Eğer sık esnetilirse, **kurallar erozyona uğrar.** Esnek davranma sadece düşük riskli sprint'lerde olmalı.

#### Security file check (her commit öncesi zorunlu)

```bash
git diff --cached --stat
# Kontrol et:
# - .env, .env.local, .env.production: STAGED OLMAMALI
# - secrets, keys, tokens: STAGED OLMAMALI
# - node_modules, .next, dist: STAGED OLMAMALI
```

#### 3 Checkpoint sistemi

**Checkpoint 1 — Pre-build:**

- `npm run type-check` clean
- `npm run lint` clean
- Memory rules ihlali yok

**Checkpoint 2 — Pre-commit:**

- `npm run build` clean (warning sayısı artmamış)
- Security file check passed
- Explicit staging (`git add -A` yok)
- Commit mesajı concrete (TODO yok, "wip" yok)

**Checkpoint 3 — Post-push:**

- Vercel preview deploy success
- Preview URL'de smoke test
- Hreflang/canonical regression check
- Önceki sprint çıktıları korunmuş

#### Diagnose-before-fix prensibi

**G-CWV-FIX-1A → 1B dersi:**

1A sprint audit'in "font preload" önerisini körü körüne uyguladı. Sonradan farkettik ki:

- Lab measurement noise içinde gerçek kazanç yoktu
- Hardcoded font hash fragility eklemişti
- Asıl LCP root cause başkaydı (third-party JS)

1B sprint farklı yaklaştı:

- Audit'in "avatar = LCP" tahminini kabul etmeden önce **eleme yöntemi** ile kanıtladı
- Resource Timing API ile gerçek runtime kanıt topladı
- Sonra fix uyguladı

**Kural:** Audit önerisi her zaman doğru olmayabilir. Önce teşhis kanıtla, sonra fix uygula.

#### Sprint deliverable format

Her sprint sonunda Claude Code şunları üretir:

```
1. Full list of changed/added files
2. DoD (Definition of Done) item proof (file:line)
3. `next build` output (warning count comparison)
4. Migration SQL dump (if applicable)
5. Mobile screenshot (if UI change)
6. Security file check output
7. `git diff --cached --stat` output
8. `git push` output
9. PR URL
10. Test results (manual or automated)
11. Honest assessment (real ROI, risks, follow-ups)
```

**Honest assessment** kuralı:

Sprint başarılı görünse bile gerçek değer marjinal ise söyle. ROI gürültü içindeyse, technical debt riski varsa, alternative path daha iyiyse — dürüst değerlendir.

### C3. Anti-Patterns (yapma listesi)

Bu pattern'ler **production'da test edilerek** kayda alındı. Tekrar yapılmayacak:

| Anti-pattern | Açıklama | Doğru yol |
|---|---|---|
| Tailwind v3 + shadcn v4 tokens | Variable bind failure | Explicit colors only |
| `pbcopy` ile çok dilli SQL >100 satır | Buffer/clipboard issues | Supabase REST API direct |
| Next.js 14 `[locale]` 404 page | Dynamic segment quirks | `app/not-found.tsx` root |
| Satori variable Arabic fonts | Render artifacts | Tajawal Bold static ~60KB |
| Hardcoded next/font hash | Bayatlar, sessiz 404 | Standard next/font API |
| "Quick fix" reflex | Root cause incelenmeden çözüm | Research → propose → execute |
| EN fallback | Multi-locale eksiklik | All 9 langs complete from start |
| TODO comments | Incomplete deliverable | Complete first time |
| "Will fix later" | Technical debt birikir | Done = Done |

### C4. Memory-Driven Workflow

Claude session memory'sinin rolü stratejik. (Detay için BÖLÜM E1.)

**Memory ne tutar:**

- Project context (Glatko nedir, tech stack, founders)
- Sprint completion durumu
- Safety rules
- Anti-patterns
- Strategic decisions
- Slug listeleri
- Auth/API kimlikleri

**Memory ne tutmaz:**

- Sprint-internal detaylar (commit hash'leri, geçici dosya path'leri)
- Hassas data (şifre, token, key)
- Verbatim conversation history (özetler tutar)

**Memory update timing:**

- Her PR merge sonrası
- Her stratejik karar sonrası
- Her yanlış varsayım düzeltildiğinde
- Her workflow rule değişikliğinde

### C5. Roadmap Timeline

Sprint sequencing — her ayın hedefi:

#### M0 (Pre-launch — şu an, Haziran 2026)

- ✅ G-CANONICAL-FIX merged
- ✅ G-CWV-FIX-1B merged
- ✅ G-PROVIDER-ROUTE-CLEANUP merged
- ✅ Indexing setup (GSC + Bing + Yandex)
- ⏳ G-AEO-FAQ-HOMEPAGE (önümüzdeki sprint)
- ⏳ G-META-DESCRIPTIONS (kısa sprint)
- ⏳ Provider operations (Radovan founding'e taşı, Hvala Puno onboard)

**M0 Definition of Done:**

- 5 cephe-1 sprint complete
- Field provider count ≥ 20 active
- 14 kategori coverage en az 1 provider

#### M1 (İlk launch wave)

- ⏳ İlk milestone-based announcement wave
- ⏳ G-AEO-H2-REWRITE (3-4 saat)
- ⏳ G-AEO-COST-TABLES (2-3 saat)
- ⏳ Helena outreach demand-driven acceleration
- ⏳ İlk gerçek review hedef: 3-5

**M1 DoD:**

- İlk announcement wave yapıldı
- 25+ provider active
- AEO content (FAQPage, Q-H2, cost tables) live tüm sayfalarda
- İlk 3 gerçek review havuzu

#### M2 (M1 + 1 ay)

- ⏳ G-PSEO-FOUNDATION (1 hafta)
- ⏳ CrUX baseline data toplanıyor (initial measurement)
- ⏳ Speed Insights $10/ay kararı yeniden değerlendir
- ⏳ G-CWV-FIX-1C scope yeniden değerlendir (field data ile)

**M2 DoD:**

- 30+ provider active
- pSEO foundation deployed (template + liquidity gate)
- 40-50 publish edilebilir kombinasyon (liquidity sağlamış)
- 10+ gerçek review

#### M3-M4 (M1 + 2-3 ay)

- ⏳ G-PROVIDER-I18N (3 hafta) — provider content 9 dile
- ⏳ G-CANONICAL-MIGRATE-2 — per-locale self-canonical
- ⏳ G-CWV-FIX-1C (eğer field data + risk değerlendirmesi izin verirse)
- ⏳ Yandex Business profile (Russian expat targeting)

**M3-M4 DoD:**

- Provider content 9 dilde
- Per-locale self-canonical migration tamamlandı
- 100+ publish edilebilir sayfa
- LCP target ≤ 4.0s (field data)
- 25+ gerçek review

#### M6 (M1 + 5 ay)

- ⏳ Content volume hedefi: 300+ publish edilebilir sayfa
- ⏳ 50+ gerçek review
- ⏳ Provider count 100+
- ⏳ Year 1 budget review (Aceternity renewal, Sanity activation, Speed Insights kararı)

#### M12 (M1 + 11 ay)

- ⏳ 1000+ publish edilebilir sayfa (BrziMajstor 2.5×)
- ⏳ 250+ gerçek review
- ⏳ LCP target ≤ 3.0s
- ⏳ Provider count 250+
- ⏳ İlk monetization deneyleri (premium features, Year 2 subscription)

### C6. Decision Framework

Stratejik kararlar verirken kullanılan çerçeve:

#### Karar matriksi (her major sprint için)

```
1. Bu karar reversible mi?
   - Reversible (kolay rollback) → hızlı dene
   - Irreversible (production DB migration, API change) → yavaş ve dikkatli

2. Risk seviyesi?
   - Düşük → standart sprint workflow
   - Orta → ekstra test + Rohat onayı
   - Yüksek → audit önce + multi-agent debate + Rohat explicit approval

3. ROI ölçülebilir mi?
   - Ölçülebilir (field data, kullanıcı feedback) → continue
   - Ölçülemez (yalnız lab) → ölçüm altyapısı önce kurulmalı, sonra karar

4. Launch proximity?
   - Major milestone uzak → büyük değişiklikler OK
   - Major milestone yakın → sadece P0 hotfix
   - Milestone sonrası → her şey OK
```

#### Bilinçli erteleme prensibi

Bazı kararlar **şimdi yapılmaz** — bu zayıflık değil, **strateji.**

Örnekler (Glatko özelinde):

| Karar | Erteleme süresi | Sebep |
|---|---|---|
| G-CWV-FIX-1C | Launch + 2-3 hafta | Field data + risk timing |
| Speed Insights $10/ay | Launch + 2 ay | Trafik gelene kadar ROI ölçülemez |
| Hard 308 redirect (middleware) | Launch sonrası | Soft redirect zaten çalışıyor |
| Founding Pro T&C | Bilinçli ertelendi | Sen avukat karar verdi |
| Sanity activation | Post-launch | Pre-launch karmaşıklık değer değil |

**Bilinçli erteleme ≠ unutma.** Her ertelenen karar **timestamp + revisit date** ile dokümante edilir.

#### "How would Airbnb do this?" heuristic

Major architecture/UX kararlarında bu soru sorulur:

- "Airbnb provider review pipeline'ı nasıl kurardı?"
- "Airbnb 9-locale content scaling stratejisi nasıl olurdu?"
- "Airbnb soft launch + ambassador stratejisi nasıl yürütürdü?"

Bu **slavishly kopyalama değil** — kalite benchmark. Quick'n'dirty çözümler bu filter'da elenir.

#### Multi-agent debate (büyük kararlar için)

3+ saatlik refactor veya production DB migration için:

1. Claude orchestrator (architect)
2. Claude Code (executor)
3. Rohat (decision-maker + domain expert)

Üçü farklı perspektifler sunar. Anlaşmazlık varsa **durur**, daha derin analiz yapılır. Bu pattern G-CWV-FIX-1C pause kararında çalıştı.

---

## BÖLÜM D — Açık Konular

### D1. Açık Audit Kalemleri

8 Haziran 2026 itibarıyla bilinen, ölçülmüş, plan'a alınmış sorunlar:

#### 🔴 RED — Critical, plan altında

**RED-1: Core Web Vitals LCP**

- **Mevcut:** Lab LCP 5.7s (Lighthouse mobile, post-1B)
- **Hedef:** Year 1 ≤ 3.0s, Year 2 ≤ 2.5s, Year 3 ≤ 2.0s
- **Root cause:** ~486KB third-party analytics JS (GTM 175KB + GA4 123KB + Meta Pixel 98KB + dependencies) main thread'i doyuruyor
- **Status:** G-CWV-FIX-1C pause edildi (D2'ye bakın)
- **Re-evaluation:** Launch + 2-3 hafta sonra (field data + risk değerlendirmesi)
- **Mitigation şu an:** 1B avatar priority ile LCP 9s → 5.7s düşürüldü, BrziMajstor 5.1s'e paralel

#### 🟡 YELLOW — Important, scheduled

**YELLOW-1: Homepage FAQPage eksik**

- **Mevcut:** Sadece category sayfalarında FAQPage schema var
- **BrziMajstor:** Her sayfada FAQPage (AEO competitive advantage onlarda)
- **Plan:** G-AEO-FAQ-HOMEPAGE sprint (4-6 saat)
- **Cephe:** 3 (AEO Content)
- **Timing:** Önümüzdeki sprint candidate
- **Hedef:** 8-10 strategic Q&A (cost, process, trust, geographic, language)

**YELLOW-2: Question-format H2s eksik**

- **Mevcut:** "Boat Cleaning Kotor" tarzı keyword H2
- **Hedef:** "How much does boat cleaning cost in Kotor?" tarzı question H2
- **Plan:** G-AEO-H2-REWRITE sprint (3-4 saat)
- **Cephe:** 3 (AEO Content)
- **Scope:** Top 20 service × city page
- **Rationale:** LLM citation magnet (ChatGPT, Perplexity, Claude)

**YELLOW-3: Cost-guide table markup eksik**

- **Mevcut:** Cost data prose format
- **Hedef:** Semantic `<table>` + `<caption>` markup
- **Plan:** G-AEO-COST-TABLES sprint (2-3 saat)
- **Cephe:** 3 (AEO Content)
- **Scope:** 5-10 kategori için cost-guide table
- **Rationale:** Featured snippet potential + LLM structured data

**YELLOW-4: Meta description length — ✅ KAPANDI (9 Haziran 2026, PR #101)**

- **Çözüm:** G-META-DESCRIPTIONS — homepage 100-120 → ~155 char, /services 60-76 → ~155; 9 dil 145-165 sweet spot
- **Bonus:** Master Plan İlke 1+3 drift meta'larda temizlendi (villa/boat vertical + Budva/Kotor/Tivat city bias kaldırıldı)
- **Açık kalan (ayrı sprint):** Visible copy drift (hero.subtitle / hero.trustedBy / trust.localDesc / becomePro) → **G-CONTENT-DRIFT** sprint candidate

**YELLOW-5: Homepage performance regression sinyali**

- **Audit (2 Haziran):** Score 81, LCP 4.8s
- **Bugün (8 Haziran):** Score 61-74, LCP 7.7-8.9s
- **Olası sebepler:**
  - (a) Lab Lighthouse variance ±13 puan (tek-run güvenilmez)
  - (b) Third-party JS (GTM/GA4/Meta) full aktivasyon
  - (c) Yeni provider data load patterns (DB query büyümesi)
  - (d) Vercel cache eviction
- **Plan:** G-CWV-FIX-1C scope'una dahil edilecek (root cause shared)
- **Şu an:** Daha derin teşhis bekletildi, field data + 1C ile birlikte çözülecek

#### 🟢 GREEN — Tamam, plan altında değil

(Referans için)

- Hreflang 10 head / 0 body ✅
- Sitemap dynamic, 1017 URL ✅
- IndexNow live, 216+ URL pushed ✅
- AI crawler allowlist + llms.txt ✅
- Provider canonical fix ✅ (PR #76)
- Provider 404 P0 fix ✅ (PR #92)
- CLS 0 (perfect) ✅
- TBT 30-140ms (good) ✅
- FCP 1.2-1.6s (good) ✅
- BCP-47 locale codes (sr-Latn-ME, etc.) ✅

#### Sitemap minor finding (bugünkü audit'ten)

`app/sitemap.ts` içinde `revalidate=3600` directive var ama `force-dynamic` override ediyor. Yani 1 saat cache **dead code**. Pratik etki: Her crawler request DB + 9× Sanity fetch trigger ediyor.

- **Şu an:** Yeni provider eklenince anında sitemap'te → avantaj
- **Launch sonrası risk:** Crawler burst (Google, Bing, Yandex aynı anda crawl) DB yorabilir
- **Plan:** Bir not olarak kayıt, M2+ sonrası izlenecek, gerekirse cleanup sprint

### D2. Bilinçli Ertelemeler

Bu kararlar **şimdi yapılmaz, sonra yapılır.** Her birinin sebebi + revisit timing'i:

#### Defer-1: Vercel Speed Insights ($10/ay)

- **Durum:** Aktive edilmedi
- **Sebep:** Trafik gelene kadar field data yok, ROI ölçülemez
- **Maliyet:** $10/ay + $0.65 per 10K events (~$125/yıl)
- **Alternative kullanılan:** Lab Lighthouse + GSC Core Web Vitals + PageSpeed Insights CrUX
- **Re-evaluation:** Launch + 2 ay sonra (yeterli trafik için)
- **Karar kriteri:** M2'de CrUX field data anlamlı mı? Eğer evet, Speed Insights gereksiz. Eğer hayır, $10/ay değer.

#### Defer-2: G-CWV-FIX-1C (third-party JS lazyOnload)

- **Durum:** Sprint pause
- **Sebep (multi-factor):**
  - Refactor gerekir (@next/third-parties wrapper, attribute flip değil)
  - Speed Insights yok → öncesi/sonrası objektif ölçüm yok
  - Lab Lighthouse ±13 puan variance → güvenilmez measurement
  - Conversion tracking riski (consent mode v2 + CAPI)
- **Alternative analiz:** 1B avatar priority kazancı 9s → 5.7s, BrziMajstor 5.1s'e paralel — hayatta kalma seviyesi geçildi
- **Re-evaluation:** Launch + 2-3 hafta sonra
- **Karar kriteri:** Field data + measurement infrastructure + risk timing müsait olduğunda

#### Defer-3: Founding Pro T&C v0.1

- **Durum:** Yazılmadı, ertelenecek
- **Sebep:** Bilinçli ertelendi (Rohat avukat kararı, 8 Haziran)
- **Re-evaluation:** Henüz tetikleyici yok. Eğer provider dispute olursa veya 50+ founding'e ulaşırsak yeniden değerlendirilir.

#### Defer-4: Hard 308 Redirect (middleware-based)

- **Durum:** Soft redirect deploy edildi (PR #92), hard 308 ertelendi
- **Sebep:** Streaming `[locale]` layout RSC client redirect zorluyor, middleware hard 308 launch öncesi risk
- **Mevcut çözüm:** Soft redirect (`/provider/[id]` → `/pros/[slug]`) + canonical tag SEO consolidation
- **Re-evaluation:** Launch sonrası (rolling launch waves devam ederken)
- **Karar kriteri:** Eğer SEO consolidation yetersiz görünürse, middleware sprint açılır

#### Defer-5: Sanity CMS Activation

- **Durum:** Code stub var, content workflow kurulmamış
- **Sebep:** RoNa Legal Sanity workspace zaten var (project `72wcsvvd`), Glatko'ya pre-launch çoklu workspace yönetimi gereksiz karmaşıklık
- **Re-evaluation:** Post-launch (rolling launch waves sonrası, M2-M3 civarı)
- **Karar kriteri:** Glatko blog content stratejisi (Cephe 3 + 4) Sanity gerektirdiğinde activate edilir
- **Maliyet impact:** RoNa Legal Growth Trial expire timing'i ile koordine

#### Defer-6: Provider Self-Registration UX Polish

- **Durum:** SMS OTP self-registration mevcut ama UX polish edilmedi
- **Sebep:** Manuel onboarding (Helena → sen → Supabase create) şu an daha güvenli (kalite kontrolü)
- **Re-evaluation:** M3+ (50+ provider sonrası, manuel scale etmez)
- **Karar kriteri:** Self-registration spam/quality issue'ları yönetilebilir hale geldiğinde

#### Defer-7: Hard-404 for Invalid Route Combos

- **Durum:** App-geneli soft-404 (HTTP 200 + noindex, nofollow not-found page)
- **Sebep:** Next.js 14 `[locale]` streaming layout limit, `notFound()` hard-404 dönüştüremiyor
- **Scope:** App-wide (mevcut `/services/[slug]` ve yeni `/services/[slug]/[city]` aynı pattern)
- **SEO impact şu an:** SIFIR
  - Invalid URL'ler sitemap'te yok
  - Internal linking yok
  - Crawler keşfetmiyor
  - Keşfetse content noindex+nofollow (zaten zararsız)
- **Çözüm:** Middleware-based hard-404 (app-wide)
- **Re-evaluation:** M2+ (gerçek trafik gelince + hard-308 redirect middleware sprintiyle birlikte)
- **İlgili:** Provider route 404 fix (PR #92) — soft redirect aynı pattern

#### Defer-8: G-FOUNDING-RESTRATEGIZE — Founding Pro Program Strateji Revize

- **Durum:** Canlı kod (`/become-a-pro/founding`, eligibility kuralı, about page) hâlâ Boka Bay-specific strateji anlatıyor
- **Gerçek:** 19 founding pro Montenegro çapında, çoğu Boka dışında (Podgorica ağırlıklı)
- **De facto ≠ de jure:** Mevcut founding havuzu country-wide ama yazılı kural Boka diyor
- **Master Plan İlke ihlali:** İlke 3 (no city priority) + İlke 4 (rolling launch) + kısmen İlke 1 (about page "boat/villa" framing)
- **Scope (genişletilmiş, 9 Haziran 2026 keşfi):**
  1. Founding-funnel Boka cluster (~10+ key): "first 50 in Boka", "soft launch", eligibility "Operating in Budva/Kotor/Tivat"
  2. About-page positioning (~3 key, `legal.aboutContent.*`): "boat owners", "villa cleaning/boat maintenance/captain hire", "Based in Budva, active across Budva/Kotor/Tivat"
- **Stratejik karar gerektirir:**
  1. Country-wide founding (eligibility "any Montenegro city")
  2. Boka batch + country-wide batch (iki segment)
  3. Founding programı kapatıp normal "verified pro" yap
- **Mevcut founding pro'lara communication plan**
- **Effort:** ~3-4 saat (translate→adversarial-verify pattern)
- **Re-evaluation:** Helena outreach + brand messaging strategy review
- **İlgili:** PR #102 G-CONTENT-DRIFT (Group A fix); Group B intentionally deferred

### D3. Önceki Master Plan Varsayımları — Temizlendi

Eski master plan'da olan, **yanlış olduğu kanıtlanan veya iptal edilen** kalemler:

| Eski varsayım | Yeni durum | Sebep |
|---|---|---|
| 9 dil: ME/EN/RU/TR/DE/IT/FR/UK/SR | 9 dil: ar/de/en/it/me/ru/sr/tr/uk | Production gerçeği (FR yok, AR var) |
| Yandex region setting kritik | Yandex Business path (region setting modern UI'de yok) | 6 Haziran Claude Code audit |
| Marine beachhead, Boka Bay focus | Genel hizmet marketplace, demand-driven | Stratejik karar (8 Haziran) |
| Soft launch 14 Mayıs 2026 | Rolling launch via milestone waves | Stratejik karar (8 Haziran) |
| BrziMajstor unknown threat | BrziMajstor MEDIUM-LOW threat (analiz tamamlandı) | Competitive analysis (6-7 Haziran) |
| pSEO M2'de 80 sayfa | M2'de 40 publish (gerçekçi rollout) | Liquidity gate reality |
| Translation budget €10-12K | gpt-4o ile $200-400/yıl | G-PROVIDER-I18N scope refinement |
| Sanity Glatko'da kurulu | Sanity kurulu değil, post-launch activation | Production audit gerçeği |
| Provider canonical strategy belirsiz | Master /me şimdi, full self-canonical M3-M4 | Stratejik karar (8 Haziran) |
| CWV budget LCP ≤ 2.0s sert | Aşamalı budget (Y1: ≤3.0s, Y2: ≤2.5s, Y3: ≤2.0s) | G-CWV-FIX-1A→1B dersi |
| Audit önerileri körü körüne uygulanır | Diagnose-before-fix prensibi | G-CWV-FIX-1A→1B dersi |
| Türk diaspora ayrı vertical olabilir | 9 dil eşit, her millete hizmet (vertical yok) | Stratejik karar (8 Haziran) |
| Boka Bay coverage öncelik | Demand-driven coverage, opportunistic | Stratejik karar (8 Haziran) |
| Speed Insights varsayılan aktif | Bilinçli ertelendi, $10/ay karar pending | 7 Haziran field data analizi |
| Liquidity gate threshold rigid (≥3 provider VE ≥5 bid) | M0-M2: ≥3 provider only, M3+: ≥5 bid aktif | Glatko realistik launch threshold (bid history yok henüz) |
| YELLOW-4 (Meta description length) açık | KAPANDI (PR #101, 9 Haziran 2026) | G-META-DESCRIPTIONS — length 145-165 + İlke 1/3 meta drift fix |

### D4. Master Plan v1 Felsefesi (5 ilke)

Tüm BÖLÜM D'nin altında yatan **temel ilkeler** — sprint kararları bu ilkelere göre verilir:

**İlke 1: Genel hizmet marketplace**

- Hiçbir vertical öncelik değil (marine, renovation, catering, tutoring, beauty — eşit)
- 14+ kategori paralel desteklenir
- Niche specialization yok

**İlke 2: 9 dil eşit muamele**

- Her dilde provider content, search, canonical, SEO juice eşit
- Diaspora vertical yok (Türk, Rus, Sırp — hepsi locale stratejisi içinde)
- "Her millete hizmet" platformu

**İlke 3: 8 şehir eşit, demand-driven**

- Hiçbir şehir öncelik (Boka Bay dahil)
- Talep + provider olduğu yerde sayfa publish (liquidity gate)
- Opportunistic acquisition (Helena network, Scott case, organic referral)

**İlke 4: Rolling launch via milestone waves**

- Formal "launch day" yok
- Milestone-based announcement waves (50 review, 100 provider, vs)
- Real readiness > tarih hedefi

**İlke 5: Demand-driven growth + liquidity gate**

- Page count target değil, conversion-ready page target
- Sprint priorities current reality'e göre (provider distribution, talep, organic patterns)
- Yapmamak da bir karar (bilinçli erteleme prensibi)

---

## BÖLÜM E — Memory & Workflow Rules

### E1. Bilgi Mimarisi — Üç Katman

Glatko bilgi sistemi üç ayrı katmanda işler. Her katmanın **farklı amacı, farklı update cadence'i, farklı sorumluluğu** var.

#### Katman 1: Claude Memory (durum)

**Amaç:** Sprint'ler arası context koruması, "ne biliyoruz" knowledge base

**Ne tutar:**

- Project context (tech stack, team, location)
- Sprint completion status
- Safety rules
- Anti-patterns
- Strategic decisions
- Identifiers (Pixel ID, GTM ID, Yandex counter, Supabase project refs)
- Founding provider mapping (slug → name → city → category)
- Pattern learnings (G-CWV-FIX-1A→1B dersi, sitemap audit bulguları)

**Update cadence:** Her PR merge + her stratejik karar + her yanlış varsayım düzeltildiğinde

**Sorumluluk:** Claude (orchestrator) memory'i günceller, Rohat onaylar

**Limit:** Compact, özet seviyesi — verbatim conversation tutmaz

#### Katman 2: Master Plan v1 (strateji)

**Amaç:** "Ne yapacağız, nasıl yapacağız, neden" — uzun vadeli stratejik referans

**Ne tutar:** BÖLÜM A-E içeriği

**Update cadence:**

- **Minor updates:** Yeni öğrenilenler dokümana eklenir (haftalık/aylık)
- **Major revisions:** Stratejik yön değişikliği (v1 → v2 her 3-6 ay)
- **Living document:** Hiç bitmiş değil, sürekli evrim

**Sorumluluk:**

- Rohat: Stratejik kararlar (5 ilke gibi)
- Claude: Yazım + revision tracking + consistency check

**Limit:** ~5000-8000 kelime range. Daha büyük olursa parçalanır (özellikle BÖLÜM B'nin her cephesi ayrı doküman olabilir M6+ sonrası).

#### Katman 3: Yapılanlar/Yapılacaklar Dosyası (operasyon)

**Amaç:** Günlük/haftalık operasyonel takip — "şu an ne sırada, ne bekliyor"

**Ne tutar:**

- Tamamlanan sprint'ler (kronolojik)
- Önümüzdeki sprint candidates (öncelik sırasına göre)
- Bekletilen/ertelenen kalemler
- Manuel operasyonel işler
- KPI hedefleri ve mevcut durum

**Update cadence:** Her sprint sonrası + her oturum

**Sorumluluk:**

- Rohat: Dosyayı saklar, günceller
- Claude: Sprint sonrası güncelleme önerileri sunar

**Limit:** Yaşayan dosya, kronolojik history

### E2. Üç Katman Arası Sınırlar

Karışıklığı önlemek için **net sınırlar**:

| Soru | Cevap | Katman |
|---|---|---|
| "Glatko'nun Supabase proje ID'si nedir?" | `cjqappdfyxgytdyeytwv` | Memory |
| "Glatko'nun SEO stratejisi nedir?" | 5 Cephe Stratejisi | Master Plan |
| "Yarın hangi sprint yapacağım?" | G-AEO-FAQ-HOMEPAGE | Yapılanlar/Yapılacaklar |
| "Force push yasak mı?" | Evet, her zaman | Memory + Master Plan C2 |
| "Türk diaspora vertical mi?" | Hayır, 9 dil eşit prensibi | Master Plan B + D |
| "Founding pro Hvala Puno var mı?" | Hayır, hiç onboard olmadı | Memory |
| "Speed Insights aktif mi?" | Hayır, ertelendi (revisit: launch + 2 ay) | Master Plan D2 |
| "Sprint 1B'de ne yapıldı?" | Avatar priority, LCP 9s → 5.7s | Memory + Yapılanlar |
| "Marine focus mu yapacağız?" | Hayır, genel hizmet marketplace | Master Plan D4 |

**Kritik prensip:** Bir bilgi **bir yerde authoritative** olmalı. Çoğul kaynaklar = drift riski.

### E3. Karar Yetkisi Hiyerarşisi

Glatko ekosisteminde 3 aktör var, her birinin **karar verme yetki sınırları** farklı:

#### Rohat (project owner)

**Tam yetki:**

- Stratejik kararlar (5 cephe, ertelemeler, vertical kararları)
- Sprint priorities (hangi sprint ne zaman)
- PR merge onayı (her zaman)
- Maliyet kararları (Speed Insights, Sanity activation, Aceternity renewal)
- Provider acquisition (Helena outreach, founding pro decisions)
- Legal/business kararları (T&C, business model, pricing)

**Memory'den izlenir:**

- Karar geçmişi
- Onay timestamp'leri
- Esnetilen kuralların pattern'i

#### Claude (orchestrator/architect)

**Tam yetki:**

- Memory update (Rohat onaylar)
- Master plan v1 yazım (Rohat onaylar)
- Sprint prompt yazım (Rohat'a sunar)
- Architectural recommendation (Rohat seçer)
- Pattern recognition

**Yetki dışı:**

- Stratejik karar verme (sadece öner)
- PR merge (Rohat onayı şart)
- Production deploy (Rohat onayı şart)
- Cost commitment (Rohat onayı şart)

#### Claude Code (executor)

**Tam yetki (autonomous):**

- Read-only audit ve teşhis
- Code yazımı (sprint prompt scope'unda)
- Local test (build, lint, type-check)
- Branch operations (backup, working branch)
- Git operations (commit, push — merge HARİÇ)

**Yetki dışı:**

- PR merge (Rohat onayı şart, memory rule)
- Force push (her zaman yasak)
- Production DB migration (Rohat onayı şart)
- Cost-incurring operations
- Sprint scope dışına çıkma (scope creep yasak)

**Stop conditions (otomatik durdurma):**

- CAPTCHA encountered
- Login wall encountered
- Build failure
- Regression detected
- Quota exceeded
- Unexpected complexity (mapping ≠ initial estimate)
- Production-impacting decision needed

### E4. İletişim Pattern'leri

#### Pattern 1: Sprint Prompt Cycle

```
Rohat ihtiyaç bildirir
   ↓
Claude prompt yazar (basit anlatım + detaylı prompt)
   ↓
Rohat prompt'u Claude Code'a yollar
   ↓
Claude Code execute eder (autonomous within scope)
   ↓
Claude Code rapor verir (chat'te + dosyalar)
   ↓
Rohat raporu inceler
   ↓
Claude raporu yorumlar, sonraki adım önerir
   ↓
Rohat karar verir (continue / pivot / pause)
```

#### Pattern 2: Karar Verme Cycle

```
Rohat soru sorar (veya Claude açık konu flag eder)
   ↓
Claude opsiyonları sunar (genelde 3 seçenek + öneri)
   ↓
Rohat seçim yapar
   ↓
Claude memory + master plan'a yazılması gereken sonucu söyler
   ↓
Onaylanırsa: memory_user_edits ile işlenir
   ↓
Doküman update'i gerekiyorsa: Claude not düşer
```

#### Pattern 3: Sustainability Check

Memory rule: Uzun çalışma sonrası Claude **proaktif olarak** Rohat'a hatırlatır:

- 6+ saat continuous focus → mola önerisi
- 13+ saat day → kapatma önerisi
- Production migration + tired brain → ertesi güne erteleme önerisi

Pattern G-CWV-FIX-1C "yorgun B" durumunda çalıştı: Claude reddetti, yarına ertelendi, sonuçta temiz fix oldu.

### E5. Doküman Güncelleme Kuralları

#### Master Plan v1 ne zaman update edilir?

**Hemen update (acil):**

- Stratejik karar değiştiğinde (5 ilkeden biri revize edilirse)
- Cephe priorities değiştiğinde
- Felaket öğrenme (örn. büyük production incident)

**Sprint sonrası update (haftalık):**

- Yeni sprint tamamlandığında ilgili cephe section güncellenir
- Açık audit kalemleri tamamlandığında D1 listesinden kaldırılır
- Bilinçli ertelemeler revisit edildiğinde D2 güncellenir

**Major revision (3-6 aylık):**

- v1 → v2 (önemli stratejik dönüşüm varsa)
- Yeni cephe açılırsa (örn. Cephe 6 = monetization)
- Felsefi değişiklik (5 ilke yetersiz kalırsa)

#### Update workflow

```
1. Rohat veya Claude değişiklik tetikler
2. Claude proposed change'i metin olarak sunar
3. Rohat onaylar / red eder / değiştirir
4. Claude master plan v1 dosyasına işler
5. Git commit (changelog ile)
6. Memory'e "v1.X update" notu düşer
```

**Versioning:**

- v1.0 = İlk yazım (8 Haziran 2026)
- v1.1, v1.2, ... = Minor updates (cephe completion, sprint additions)
- v2.0 = Major revision (stratejik shift)

### E6. Sustainability Prensipleri

#### Çalışma süresi sınırları

- **Optimal:** 4-6 saat continuous focus
- **Sustainable maximum:** 8-10 saat (mola dahil)
- **Critical maximum:** 13 saat (ondan sonra kalite düşer, hata riski yükselir)

#### Decision fatigue indicators

Claude bu pattern'leri izler:

- "Geçelim" / "atla" / "hızlıca" pattern'i artıyorsa → fatigue
- Stratejik soru ertelenmesi → fatigue
- Production change isteği gece geç saatlerde → fatigue
- "Şimdi yap" insistence → fatigue (özellikle riski yüksek değişikliklerde)

**Claude tepkisi:** "Yarın taze kafayla" önerisi. Reddedilirse ısrar etmez ama not düşer.

#### Pre-milestone crunch protection

Milestone wave yaklaşırken:

- Sadece P0 hotfix
- Yeni feature deploy yok
- DB migration sadece off-peak
- Stratejik karar değişikliği yok

### E7. Quality Standards

Tüm sprint'lerde geçerli, asla esnetilmez:

- **TypeScript strict** — no `any`
- **i18n complete** — tüm 9 dilde, EN fallback yok
- **Zero TODO** — partial output yok, "sonra yaparım" yok
- **External call discipline** — caching + try/catch + graceful fallback
- **Cost monitoring** — metered service'ler için 80% quota alert
- **Quality benchmark** — Airbnb + Sotheby's + Porsche Design seviyesi
- **Multi-agent debate** — major decisions için (3+ saat refactor, production DB migration)

### E8. Living Document Principle

**Master plan v1 hiç "bitmiş" değil.** Bu doküman:

- Sprint'lerle birlikte evrim geçirir
- Yeni öğrenilenler dahil olur
- Yanlış varsayımlar düzeltilir
- Stratejik kararlar refine edilir
- Felaket öğrenmeler kayda alınır

**Stable kısım:** 5 ilke (D4'teki felsefe) — bunlar v2'ye kadar değişmez

**Dinamik kısım:** Cephe progress, sprint completion, audit findings, deferral decisions

**Doküman sahibi:** Rohat (final approval), Claude (yazım + maintenance)

**Hedef:** Yeni Claude session geldiğinde, master plan'ı okuyup **eski Claude'un yerine geçebilir.** Context erozyonu master plan + memory ile minimize edilir.

---

## Doküman Sonu

**Glatko Master SEO Plan v1.0** — 8 Haziran 2026 itibarıyla yaşayan stratejik referans.

**Sonraki revision tetikleyicileri:**

- Cephe 1 → 2 → 3 → 4 → 5 milestone'ları tamamlanınca durum updates
- Yeni sprint completion'larında ilgili bölüm refresh
- Stratejik karar değişikliklerinde 5 ilke ve D4 felsefesi review
- M6 sonrası: v1.x veya v2.0 değerlendirmesi

**Master plan v1 ile uyumlu olarak hazırlanan diğer dokümanlar:**

- `docs/seo/glatko-yapilanlar-yapilacaklar.md` — operasyonel takip
- Memory notes — durum + sprint progress
- `/tmp/g-*-report.md` dosyaları — sprint-internal raporlar (geçici)

---

**Versiyon Geçmişi:**

- **v1.0 (8 Haziran 2026):** İlk yazım — 5 stratejik karar (genel marketplace, 9 dil eşit, demand-driven, rolling launch, full self-canonical) ve 5 cephe stratejisi netleşti
- **v1.1 (8 Haziran 2026):** Defer-7 (hard-404 invalid combos — app-wide soft-404, M2+ middleware) + liquidity gate aşamalı threshold (M0-M2: ≥3 provider; M3+: ≥5 bid) + Cephe 4 liquidity bölümü güncellendi — G-PSEO-FOUNDATION-FAZ1 (PR #96) sırasında doğrulandı
- **v1.2 (9 Haziran 2026):** D1 YELLOW-4 (meta description length) KAPANDI — G-META-DESCRIPTIONS (PR #101): 9 dil 145-165 char + İlke 1+3 meta drift fix (villa/boat + Budva/Kotor/Tivat temizlendi). Visible copy drift (hero/trust/becomePro) → G-CONTENT-DRIFT candidate işaretlendi. (v1.1 + v1.2 tek squash merge ile main'e girdi.)
- **v1.3 (9 Haziran 2026):** D2 Defer-8 eklendi (G-FOUNDING-RESTRATEGIZE) — founding-funnel Boka cluster (~10 key) + about-page positioning (~3 key, `legal.aboutContent.*`); stratejik karar bekliyor (country-wide vs Boka). G-CONTENT-DRIFT (PR #102, Group A fixed) deferred Group B'de keşfedildi.
