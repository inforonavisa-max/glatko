# GLATKO SAĞLIK (Health Vertical) — Master Uygulama Planı v1.4

> Doktortakvimi.com mantığında, Glatko.app içinde ayrı bir bölüm olarak inşa edilecek
> sağlık randevu sistemi. Bu doküman Claude Code'a sprint sprint verilecek tek kaynak plandır.
> Tarih: 2026-06-12 · Hazırlayan: Claude (araştırma raporuna dayanarak)
> **v1.1 (12.06.2026):** K1–K7 kararları Rohat tarafından onaylandı; K7 hibrit renk
> sistemine revize edildi (Bölüm 1.5); Doktortakvimi tasarım referansı eklendi (Bölüm 1.4).
> **v1.2 (12.06.2026, H0 sırasında):** K7-r2 — v1.1'deki "mevcut accent Indigo"
> varsayımı kodla çelişiyordu (gerçek marka rengi teal `#14B8A6/#0D9488`,
> `tailwind.config.ts`). Rohat onayıyla renk haritası revize edildi (Bölüm 1.5);
> H0 uygulama notları H0 bölümünün sonuna eklendi.
> **v1.3 (15.06.2026):** "Glatko Sağlık" alt-marka (sub-brand) mimarisi eklendi
> (yeni Bölüm 1.6, Getir modeli: isim + modülerlik + ayrılabilirlik, bugün ayrı
> altyapı YOK). §1.5 tek-kaynak `brandHealth`/`brandCareer` token'larına geçti
> (eski `health-*`/`career-*` → yeniden adlandırıldı) + sky-600 metin-kontrast
> notu. Carve-out checklist: `docs/health/EXTRACTION.md`. Tüm planda
> **"İş & Kariyer" → "İş"** (switcher etiketi kısaldı, K1 hedefi değişmedi).
> **v1.4 (15.06.2026):** Migration 065 prod'a uygulandı (glatko-prod, Rohat
> onayı + 6 koşul). **Konvansiyon (bilinçli): DB şeması `health` KALIR, kod
> namespace'i `saglik` (`lib/saglik/`, `components/glatko-saglik/`).** Yani
> kod-tarafı Türkçe alt-marka adını, DB-tarafı nötr İngilizce şema adını kullanır;
> ikisi kasıtlı ayrı — H1+ migration'larında şema adı `health` olarak devam eder.
> Coming-soon waitlist formuna aydınlatma satırı + gizlilik linki eklendi
> (prod'da gerçek PII).
> **v1.5 (16.06.2026, H1):** §2 veri modeli TAM uygulandı — `066_health_h1_schema.sql`
> (16 tablo + book_appointment + owns_provider + appointments kolon-kilidi trigger +
> §2.2 RLS matrisi + pg_cron `health_cleanup_expired` + `health-licenses` bucket) ve
> `067_health_h1_seed.sql` (20 uzmanlık 9/9 + 2 test provider) glatko-prod'a uygulandı
> (additive; 065 dokunulmadı). Kanıt: concurrency (1 başarı + 1 SLOT_TAKEN + HOLD_EXPIRED
> + slot_holds EXCLUDE), RLS (anon deny-all/C1-C4, provider-own), search_path="" pinli,
> get_advisors 066'dan 0 ERROR (yalnız kasıtlı deny-all INFO'lar). Karar: **anon'a health
> şemasında HİÇBİR grant yok** (DoD C4); §2.2 "anon SELECT" public-read H2'de server/
> service-role ile sunulacak (RLS policy'leri + authenticated grant'lar hazır). book_appointment
> `health` şemasında; PostgREST rpc çağrılabilirliği H5'te (expose veya public wrapper).
> Flag prod=false KALIR — kullanıcıya görünen değişiklik yok.
> **v1.6 (16.06.2026, H2):** Uzman dizini + profil (3 sayfa: ana / `[specialty]` /
> `uzman/[slug]`, hepsi gated+noindex, 9 locale). **Mimari karar (Rohat): health
> şeması PostgREST'e EXPOSE EDİLMEZ** — H1'in "anon SELECT public-read" hücresi,
> `public` şemasında 3 SECURITY DEFINER salt-okuma RPC ile sunulur
> (`068_health_h2_read_rpcs.sql`: `health_list_specialties` / `health_providers_by_specialty`
> / `health_get_provider`; search_path='' pinli, yayın filtresi RPC içinde → anon hiçbir
> koşulda yayınlanmamış veri göremez). Server-only data-access: `lib/saglik/queries.ts`
> (`'server-only'` + cookie-free `createAdminClient` → ISR uyumlu). Kanıt: 3 sayfa
> tr/en/me desktop+mobil render, yayın filtresi (unpublished→liste 0+profil 404),
> service-role key client bundle'da YOK, advisor 0 yeni ERROR (3 RPC search_path-mutable
> DEĞİL; anon_security_definer WARN'ları kasıtlı = read-gateway). Saat-chip/booking
> alanları H4/H5-hazır placeholder (sahte veri yok). Flag prod=false KALIR.

---

## 0. DEMİR KURALLAR (her sprintte geçerli)

1. **CANLIYA ALMA YASAĞI.** `HEALTH_VERTICAL_ENABLED` flag'i Production'da **false** kalır.
   Tüm sprintler main'e merge edilir ama prod'da hiçbir sağlık sayfası erişilebilir olmaz.
   Flag sadece Rohat'ın yazılı **"launch onayı"** ile açılır (bkz. H11 checklist).
2. **Mevcut site ile %100 uyum.** Mevcut Glatko tasarım sistemi (Indigo `#6366F1` accent,
   mevcut tipografi, mevcut component kütüphanesi, mevcut header/footer), mevcut i18n
   altyapısı (9 locale), mevcut Supabase client pattern'leri, TypeScript strict (`any` yasak),
   mevcut Tailwind config. Yeni bir tasarım dili İCAT ETME — sağlık bölümü Glatko'nun
   doğal uzantısı gibi hissettirmeli.
3. **Sprint workflow (değişmez):** Claude Code uygular → Rohat local test + preview URL test
   → açık **"local OK + preview OK"** → ancak ondan sonra merge. Onaysız merge yok.
4. **Sprint teslim formatı (her sprintte zorunlu):**
   - Değişen dosyalar listesi
   - DoD kanıtı `dosya:satır` referanslı
   - Build warning karşılaştırması (önce/sonra)
   - Migration varsa SQL dosyası
   - Gerekiyorsa mobil ekran görüntüsü
   - Security dosya kontrolü (secret sızıntısı yok)
   - `git diff --cached --stat` + `git push` çıktısı
5. **Dış servis çağrılarında iki katman zorunlu** (Upstash olayından kalan ev kuralı):
   cache katmanı + try/catch graceful fallback. Infobip, Resend, Mapbox dahil hepsi.
   Metered servislerde %80 kota alarmı.
6. **Lisans kararı:** cal.com **AGPL-3.0 → fork ETME, dependency olarak EKLEME.**
   cal.diy **MIT → algoritmaları referans al, kodu serbestçe uyarla.** Slot/availability
   motorunu kendi Supabase-native kodumuz olarak yazıyoruz (Prisma bağımlılığı
   taşımamak için). Rapordan tek sapma bu, gerekçesi: Glatko supabase-js kullanıyor,
   tek özellik için Prisma katmanı eklemek mimariyi kirletir.
7. **Veri:** Tüm zaman damgaları `TIMESTAMPTZ` UTC. Render `Europe/Podgorica`.
   Hasta PII (telefon, email, not) kolon seviyesinde şifreli. Supabase **Frankfurt
   (eu-central-1)** — mevcut proje `cjqappdfyxgytdyeytwv` zaten Frankfurt, değişiklik yok.
8. **SEO karantinası:** Launch'a kadar tüm `/saglik` rotaları `noindex, nofollow` +
   sitemap dışı. Flag açılınca tersine döner.

---

## 1. MİMARİ GENEL BAKIŞ

### 1.1 Route yapısı (App Router)

```
app/[locale]/(health)/saglik/
├── page.tsx                        # Sağlık ana sayfası (arama + uzmanlık kartları)
├── layout.tsx                      # Health layout (flag guard + noindex)
├── [specialty]/page.tsx            # Uzmanlık listesi (örn. /saglik/dis-hekimi)
├── [specialty]/[city]/page.tsx     # Şehir filtrelenmiş liste (SEO sayfaları)
├── uzman/[slug]/page.tsx           # Doktor/uzman profil + takvim widget
├── randevu/[holdId]/page.tsx       # Booking flow (hasta bilgi + OTP + onay)
├── randevu/onay/[code]/page.tsx    # Confirmation sayfası
├── r/[token]/page.tsx              # Magic-link: hasta randevu yönetimi (iptal/erteleme)
└── yakinda/page.tsx                # Coming-soon landing (prod'da flag OFF iken)
app/[locale]/(health)/saglik-pro/   # Provider (doktor) tarafı — auth gerekli
├── page.tsx                        # Dashboard (bugünün randevuları, doluluk)
├── takvim/page.tsx                 # Takvim yönetimi (haftalık grid + override)
├── randevular/page.tsx             # Randevu listesi + durum yönetimi
├── profil/page.tsx                 # Profil + hizmetler + lokasyonlar editörü
├── ayarlar/page.tsx                # Buffer, min notice, horizon, günlük limit
└── basvuru/page.tsx                # Onboarding wizard (lisans yükleme dahil)
app/api/health/
├── slots/route.ts                  # GET müsait slotlar
├── holds/route.ts                  # POST slot hold (5 dk)
├── bookings/route.ts               # POST randevu (RPC çağırır)
├── otp/route.ts                    # POST gönder / PUT doğrula
└── manage/[token]/route.ts         # Hasta self-service iptal/erteleme
```

- URL slug'ları mevcut locale slug sistemine uyar (tr: `/saglik`, en: `/health`,
  me/sr: `/zdravlje` …). **Claude Code önce mevcut slug çeviri mekanizmasını
  inceleyip aynı pattern'i uygulasın** — yeni mekanizma icat etmesin.
- Admin tarafı: mevcut Glatko admin paneline `Sağlık` sekmesi eklenir (ayrı app değil).

### 1.2 Anasayfa: 3 sekmeli kapanır navigasyon (Airbnb tarzı)

- Sekmeler: **Hizmetler** (mevcut reverse marketplace) · **İş** · **Sağlık**
  (switcher etiketleri kısa; adlandırılmış lockup için bkz. §1.6)
- Davranış: Anasayfanın en üstünde büyük ikonlu sekmeler; scroll'da küçülüp sticky
  header satırına gömülür (Fijaka'daki implementasyon birebir referans — Claude Code
  `/Users/Shared/dev/` altındaki Fijaka repo'sundan pattern'i inceleyebilir).
- Teknik: scroll listener veya IntersectionObserver + CSS transform/opacity transition,
  `prefers-reduced-motion` desteği, mobilde yatay kaydırılabilir chip'ler.
- **Sağlık sekmesi flag OFF iken:** prod'da sekme görünür ama `/saglik/yakinda`
  coming-soon sayfasına gider (doktor bekleme listesi e-posta formu = launch öncesi
  arz toplama). Flag ON olunca gerçek sağlık ana sayfasına gider.
  *(K2 onaylandı: "Yakında" + doktor bekleme listesi.)*
- **İş hedefi (K1 onaylandı):** kendi coming-soon sayfası — işçi temin
  vertical'ı için yer tutucu (switcher etiketi "İş", v1.3'te "& Kariyer" düştü).

### 1.3 Veritabanı yapısı

- **Adlandırma konvansiyonu (v1.4, bilinçli):** DB-tarafı şema adı **`health`**
  (nötr İngilizce, H1+ tüm migration'larda sabit) — kod-tarafı namespace ise
  **`saglik`** (`lib/saglik/`, `components/glatko-saglik/`, marka "Glatko Sağlık").
  İkisi kasıtlı ayrı: şema adı uluslararası/teknik, kod adı yerel alt-marka.
- Aynı Supabase projesi, ayrı **`health` şeması** (mevcut tablolarla karışmaz).
- Extension'lar: `btree_gist` (overlap exclusion), `pgcrypto` (PII şifreleme),
  `pg_cron` (reminder dispatch), `earthdistance + cube` (geo arama — PostGIS yerine
  hafif çözüm; mevcut projede PostGIS varsa onu kullan).
- RLS her tabloda açık. Yazma işlemlerinin kritik olanları **SECURITY DEFINER
  Postgres fonksiyonları** üzerinden (atomiklik + yetki kontrolü tek yerde).

### 1.4 Tasarım referansı: Doktortakvimi sadelik sözleşmesi

Hedef: **Doktortakvimi'nin sadeliği, Glatko'nun görsel dili.** Kopyalanan şey marka
değil, UX pattern'leridir. Tüm public health UI'ları şu 6 maddeye uyar:

1. **Hero = tek iş.** İki alanlı arama (Uzmanlık/doktor adı + Şehir) + tek buton.
   Üstte başka hiçbir şey yok; hemen altında popüler uzmanlık chip'leri
   (Diş Hekimi, Psikolog, Dermatolog…).
2. **Liste kartında saatler.** Kart: foto, ünvan + isim, branş, "Doğrulanmış" rozeti,
   adres (+harita linki) ve EN KRİTİĞİ — sonraki 3 gün için **tıklanabilir müsait
   saat chip'leri doğrudan kartın içinde.** Saate tıkla → booking başlar.
   (Docplanner'ın imza UX'i; dönüşümün kalbi. H2'de placeholder, H4'te canlanır.)
3. **Profil = iki kolon.** Solda bilgi (bio, hizmet + fiyat, adres/harita, diller),
   sağda sticky takvim widget'ı. Mobilde widget, alta sabitlenmiş "Randevu Al"
   butonuna dönüşür.
4. **Booking = tek sayfa, 3 alan.** Ad, telefon (+ ops. email), not. OTP aynı
   sayfada inline. Hesap zorunluluğu YOK. Adım göstergesi: Saat → Bilgiler → Onay.
5. **Az metin, çok beyaz alan.** Kart başına en fazla 2 satır ikincil bilgi;
   pazarlama metni yok; rozetler olgusal.
6. **Yasak:** "en iyi doktor" sıralamaları, puan yıldızları (v1'de yorum yok),
   agresif banner/promosyon alanları.

### 1.5 Renk sistemi (K7-r2 — hibrit karar, 12.06.2026 revize)

> **K7-r2 düzeltmesi:** v1.1 "Indigo mevcut ana renk" varsayımıyla yazılmıştı;
> kodda Glatko'nun gerçek ana rengi **teal** (`#14B8A6` / `#0D9488`,
> `tailwind.config.ts` + tüm CTA/header). Bu yüzden Sağlık=teal seçimi ana
> markayla çakışıyordu. Rohat onayıyla (12.06) harita şöyle revize edildi:

**Tek marka, üç ortam.** Teal Glatko'nun değişmez ana rengidir; her vertical
yalnız "ortam" seviyesinde kısıtlı bir vurgu rengi alır:

| Vertical | Vurgu | Ton kuralı |
|---|---|---|
| Hizmetler | Teal (mevcut marka) | mevcut sistem aynen |
| Sağlık | Medikal Mavi `#0284C7` (sky-600, **`brandHealth`** token) | ikon/gösterge: DEFAULT · **metin: 700 (ZORUNLU)** · zemin tint: brandHealth-50 |
| İş | Amber `#D97706` (amber-600, **`brandCareer`** token) | aynı kural (50 / DEFAULT / 700) |

> **v1.3 token değişimi:** Vurgu artık her vertical için **tek kaynak** bir token
> grubundan gelir — `brandHealth { DEFAULT:#0284C7, 50, 700 }`, `brandCareer
> { DEFAULT:#D97706, 50, 700 }` (`tailwind.config.ts`). Saçılmış sky/amber hex
> YASAK. Eski `health-*`/`career-*` grupları yeniden adlandırıldı. Carve-out'ta
> `brandHealth` → `primary` olur, gerisi otomatik döner (Bölüm 1.6 + EXTRACTION.md).
>
> **Kontrast notu (ZORUNLU):** sky-600 (DEFAULT) beyaz üzerinde 4.10:1 → AA metin
> eşiği 4.5:1'in ALTINDA. DEFAULT yalnız ikon/gösterge/zemin için; **okunur metinde
> ASLA** kullanma — metin gerekiyorsa `brandHealth-700` (5.93:1). `VerticalBrand`
> lockup'ındaki dikey kelime de 700 kullanır.

Vurgu rengin **izin verilen** yerleri (tam liste — başkası yasak):

1. 3'lü navigasyonda sekme ikonu + aktif sekme göstergesi
2. Vertical hero/bölüm zemin tint'i (yalnız 50 tonu)
3. Vertical içi kategori/uzmanlık ikonları
4. Bilgilendirici küçük rozet ve chip'ler ("Doğrulanmış", müsait saat chip'leri)
5. `VerticalBrand` lockup'ında dikey kelimesi (yalnız 700 — kontrast notu)

**Yasak yerler:** butonlar/CTA'lar (her zaman teal), linkler, form focus
ring'leri, header/footer, logo. Gerekçe: tek etkileşim dili (teal) marka
bütünlüğünü korur; vurgu renkleri yalnız yön bulma (wayfinding) işlevi görür —
Airbnb'nin vertical modeli. Medikal mavi ayrıca sağlık bölümüne Doktortakvimi
benzeri "medikal güven" hissini doğal olarak verir.

Implementasyon: Tailwind config'e `brandHealth` ve `brandCareer` token grupları;
vurgu sınıfları yalnız ilgili route group'larında kullanılır (lint/review'da
denetlenir). Health bölümü aksanını YALNIZ `brandHealth-*` sınıflarından alır.

### 1.6 "Glatko Sağlık" alt-marka (sub-brand) mimarisi — Getir modeli

**Amaç:** Sağlık ve İş bölümleri Glatko şemsiyesi altında **isimlendirilmiş**
alt-markalar; ileride bağımsız ayrılabilir/satılabilir (ayrı tüzel kişilik,
domain, ortaklık). **Bugün ayrı repo/DB/altyapı YOK** — yalnız (a) isim,
(b) kod modülerliği, (c) tek-kaynak renk token'ı, (d) carve-out dokümanı.
Getir'in "Getir / GetirYemek / GetirBüyük" yapısı gibi: tek ana marka + adlandırılmış
dikeyler. (Subdomain/ayrı domain ŞİMDİ KURULMAZ; yalnız hardcode önlenir.)

**(a) İsim + lockup.** `<VerticalBrand vertical="health|career" />`
(`components/glatko/verticals/VerticalBrand.tsx`) "Glatko" wordmark + yerelleşmiş
dikey kelimesini birleştirir (9 locale: Sağlık/Health/Zdravlje/Gesundheit/Salute/
Здоровье/Здоровʼя/الصحة; İş/Jobs/Posao/Arbeit/Lavoro/Работа/Робота/العمل). Dahili
sabit ad: **"Glatko Sağlık"** (`HEALTH_INTERNAL_NAME`, loglar/admin/analytics).
**Switcher sekme etiketleri KISA kalır** (Hizmetler · İş · Sağlık); adlandırılmış
lockup yalnız bölüm hero'larında + coming-soon sayfalarında görünür.

**(b) Modülerlik (ayrılabilirlik).** Sağlığa özel kod namespace'li:
`lib/saglik/` (flag, path config) + `components/glatko-saglik/` (formlar). Cross-vertical
switcher glue ayrı: `lib/verticals/` + `components/glatko/verticals/`. İlke: sağlık
kodu yalnız paylaşılan primitive'lere (`components/ui`, `lib/utils`, i18n, Supabase
client factory) bağlanır; App-spesifik marketplace component'lerine ASLA. Health
şeması core `public.*`'a FK vermez (`auth.users` tek bilinçli istisna).

**(c) Tek-kaynak renk.** §1.5'teki `brandHealth`/`brandCareer` token grupları.
Saçılmış hex YOK.

**(d) Path config.** `lib/saglik/config.ts` → `HEALTH_ROUTES` (rota anahtarları)
+ `HEALTH_HOST` (bugün `null` = ana app altında; carve-out'ta `saglik.glatko.app`).
`/saglik` literal'i hiçbir component'e gömülmez.

**Carve-out (ileride ayırma) adımları:** `docs/health/EXTRACTION.md` — neyin izole
neyin paylaşılan olduğu + 6 adımlı ayırma sırası (token→primary, `pg_dump --schema=health`,
kod paketle, domain bağla, kullanıcı export, servis anahtarları). Her H-sprint sonunda
"yeni paylaşılan bağ ekledim mi?" diye oraya bakılır.

---

## 2. VERİ MODELİ (tam şema — H1 migration'ın temeli)

```sql
-- =========== HEALTH ŞEMASI ===========
CREATE SCHEMA IF NOT EXISTS health;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pg_cron Supabase dashboard'dan enable edilir; cube/earthdistance gerekirse eklenir

-- Uzmanlık taksonomisi (9 locale çeviri: jsonb)
CREATE TABLE health.specialties (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text UNIQUE NOT NULL,           -- 'dis-hekimi'
  names       jsonb NOT NULL,                 -- {"tr":"Diş Hekimi","en":"Dentist","me":"Stomatolog",...}
  icon        text,
  sort_order  int DEFAULT 0,
  is_active   boolean DEFAULT true
);

CREATE TABLE health.clinics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid REFERENCES auth.users(id),
  name            text NOT NULL,
  vat_number      text,
  created_at      timestamptz DEFAULT now()
);

CREATE TABLE health.locations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid REFERENCES health.clinics(id),
  label       text NOT NULL,                  -- 'Budva Merkez Klinik'
  address     text NOT NULL,
  city        text NOT NULL,
  lat         double precision,
  lng         double precision,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE health.providers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid UNIQUE REFERENCES auth.users(id),
  provider_type       text NOT NULL CHECK (provider_type IN
                        ('doctor','dentist','psychologist','physio','other')),
  full_name           text NOT NULL,
  title               text,                   -- 'Dr. med.', 'Spec.'
  slug                text UNIQUE NOT NULL,
  license_number      text,
  chamber             text,                   -- 'LJKCG' | 'SKCG' (diş) | diğer
  languages           text[] DEFAULT '{}',    -- ['me','en','tr','ru']
  bio                 jsonb,                  -- locale -> metin
  photo_url           text,
  verification_status text NOT NULL DEFAULT 'pending'
                        CHECK (verification_status IN ('pending','approved','rejected')),
  verified_at         timestamptz,
  is_published        boolean DEFAULT false,
  subscription_tier   text DEFAULT 'free',
  created_at          timestamptz DEFAULT now()
);

CREATE TABLE health.provider_specialties (
  provider_id  uuid REFERENCES health.providers(id) ON DELETE CASCADE,
  specialty_id uuid REFERENCES health.specialties(id),
  PRIMARY KEY (provider_id, specialty_id)
);

CREATE TABLE health.provider_locations (
  provider_id uuid REFERENCES health.providers(id) ON DELETE CASCADE,
  location_id uuid REFERENCES health.locations(id),
  PRIMARY KEY (provider_id, location_id)
);

CREATE TABLE health.services (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES health.providers(id) ON DELETE CASCADE,
  name         jsonb NOT NULL,                -- locale -> isim
  duration_min int NOT NULL CHECK (duration_min BETWEEN 5 AND 240),
  price_eur    numeric(8,2),                  -- NULL = fiyat gösterme
  mode         text NOT NULL DEFAULT 'in_person'
                 CHECK (mode IN ('in_person','video','home_visit')),
  is_active    boolean DEFAULT true
);

-- Haftalık tekrar eden çalışma saatleri
CREATE TABLE health.schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES health.providers(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES health.locations(id),
  weekday     int NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=Pazartesi
  start_time  time NOT NULL,
  end_time    time NOT NULL,
  valid_from  date,
  valid_until date,
  CHECK (start_time < end_time)
);

-- Tek günlük istisnalar: tatil / mola / ekstra mesai
CREATE TABLE health.schedule_overrides (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES health.providers(id) ON DELETE CASCADE,
  date        date NOT NULL,
  start_time  time,
  end_time    time,
  kind        text NOT NULL CHECK (kind IN ('holiday','break','extra'))
);

CREATE TABLE health.provider_settings (
  provider_id     uuid PRIMARY KEY REFERENCES health.providers(id) ON DELETE CASCADE,
  buffer_min      int DEFAULT 0,
  min_notice_min  int DEFAULT 120,            -- en az 2 saat önceden
  horizon_days    int DEFAULT 60,
  daily_cap       int,                        -- NULL = limitsiz
  slot_grid_min   int DEFAULT 15              -- slot başlangıç ızgarası
);

-- Hastalar: hesap zorunlu değil (guest-first, Doctolib pattern'i)
CREATE TABLE health.patients (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid REFERENCES auth.users(id),     -- opsiyonel
  full_name               text NOT NULL,
  phone_enc               bytea NOT NULL,     -- pgp_sym_encrypt
  email_enc               bytea,
  phone_hash              text NOT NULL,      -- arama/dedup için sha256
  consent_health_data_at  timestamptz NOT NULL,  -- PDPL Md.13 açık rıza
  consent_marketing_at    timestamptz,
  created_at              timestamptz DEFAULT now()
);
CREATE INDEX ON health.patients (phone_hash);

-- 5 dakikalık soft hold (UX katmanı)
CREATE TABLE health.slot_holds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id  uuid NOT NULL REFERENCES health.providers(id),
  service_id   uuid NOT NULL REFERENCES health.services(id),
  location_id  uuid NOT NULL,
  slot_range   tstzrange NOT NULL,
  session_key  text NOT NULL,                 -- anonim tarayıcı oturumu
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  EXCLUDE USING gist (provider_id WITH =, slot_range WITH &&)
);

-- RANDEVULAR — sistemin kalbi
CREATE TABLE health.appointments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id   uuid NOT NULL REFERENCES health.providers(id),
  service_id    uuid NOT NULL REFERENCES health.services(id),
  location_id   uuid NOT NULL REFERENCES health.locations(id),
  patient_id    uuid NOT NULL REFERENCES health.patients(id),
  slot_range    tstzrange NOT NULL,           -- [start, end)
  status        text NOT NULL DEFAULT 'confirmed'
                  CHECK (status IN ('confirmed','cancelled','completed','no_show')),
  patient_note  text,
  manage_token  text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  source        text NOT NULL DEFAULT 'web' CHECK (source IN ('web','admin','provider')),
  cancelled_at  timestamptz,
  cancel_reason text,
  created_at    timestamptz DEFAULT now()
);

-- ÇİFT REZERVASYON KORUMASI KATMAN 1: aktif randevular çakışamaz
ALTER TABLE health.appointments ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (provider_id WITH =, slot_range WITH &&)
  WHERE (status = 'confirmed');
CREATE INDEX ON health.appointments (provider_id, status);
CREATE INDEX ON health.appointments USING gist (slot_range);

CREATE TABLE health.otp_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash  text NOT NULL,
  code_hash   text NOT NULL,                  -- sha256(code + salt)
  attempts    int DEFAULT 0,
  expires_at  timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  verified_at timestamptz,
  created_at  timestamptz DEFAULT now()
);
CREATE INDEX ON health.otp_codes (phone_hash, created_at);

CREATE TABLE health.reminders_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES health.appointments(id) ON DELETE CASCADE,
  channel         text NOT NULL CHECK (channel IN ('sms','whatsapp','email')),
  template        text NOT NULL,              -- 'confirm','t24','t2','followup','cancelled'
  send_at         timestamptz NOT NULL,
  sent_at         timestamptz,
  provider_msg_id text,
  status          text DEFAULT 'pending'
                    CHECK (status IN ('pending','sent','failed','skipped')),
  retry_count     int DEFAULT 0
);
CREATE INDEX ON health.reminders_outbox (status, send_at);

CREATE TABLE health.audit_log (
  id           bigserial PRIMARY KEY,
  actor_id     uuid,
  action       text NOT NULL,
  target_table text,
  target_id    uuid,
  payload      jsonb,
  at           timestamptz DEFAULT now()
);

-- Lisans belgeleri: PRIVATE storage bucket 'health-licenses' (public erişim KAPALI)
```

### 2.1 Atomik rezervasyon fonksiyonu (KATMAN 2 — tek kapı)

```sql
CREATE OR REPLACE FUNCTION health.book_appointment(
  p_hold_id uuid, p_patient_id uuid, p_note text
) RETURNS health.appointments
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_hold health.slot_holds; v_appt health.appointments;
BEGIN
  SELECT * INTO v_hold FROM health.slot_holds
   WHERE id = p_hold_id AND expires_at > now()
   FOR UPDATE;                                -- KATMAN 2: pessimistic lock
  IF NOT FOUND THEN
    RAISE EXCEPTION 'HOLD_EXPIRED';
  END IF;
  INSERT INTO health.appointments
    (provider_id, service_id, location_id, patient_id, slot_range, patient_note)
  VALUES
    (v_hold.provider_id, v_hold.service_id, v_hold.location_id,
     p_patient_id, v_hold.slot_range, p_note)
  RETURNING * INTO v_appt;                    -- KATMAN 1 (EXCLUDE) son bekçi
  DELETE FROM health.slot_holds WHERE id = p_hold_id;
  RETURN v_appt;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'SLOT_TAKEN';
END $$;
```

- API tarafı `SLOT_TAKEN` / `HOLD_EXPIRED` hatalarını yakalayıp kullanıcıya
  "Bu saat az önce dolduruldu" + slot listesini yenile davranışı gösterir.
- `pg_cron` her 5 dk: süresi geçmiş `slot_holds` ve `otp_codes` temizliği.

### 2.2 RLS özeti

| Tablo | anon (hasta) | provider | admin |
|---|---|---|---|
| specialties, providers (published), services, locations | SELECT | SELECT | ALL |
| schedules, overrides, settings | — (slot API üzerinden) | kendi satırları ALL | ALL |
| appointments | — (manage_token RPC ile) | kendi satırları SELECT/UPDATE(status) | ALL |
| patients | — | yalnız kendi randevularının hastası: ad + maskeli tel | ALL |
| slot_holds, otp_codes, reminders_outbox, audit_log | — | — | ALL (service role) |

Tüm hasta yazma işlemleri SECURITY DEFINER fonksiyonlar / route handler'daki
service-role client üzerinden — anon key ile doğrudan tablo yazımı kapalı.

---

## 3. SPRINT PLANI (H-serisi)

> Her sprint = bir Claude Code oturumu. Kapsam bloğu doğrudan prompt olarak
> kopyalanabilir. Her sprintin DoD'sine Bölüm 0'daki teslim formatı dahildir.
> Sıra bağımlılık sırasıdır; H2–H3 ve H6–H7 paralel yürüyebilir.

### H0 — Navigasyon + İskelet + Flag (kod tarafının temeli)

**Kapsam:**
- `HEALTH_VERTICAL_ENABLED` env (Vercel: Production=false, Preview=true, Dev=true).
- Middleware guard: flag OFF iken `/[locale]/saglik/*` ve `/saglik-pro/*` → 404
  (yakinda sayfası hariç). Defense-in-depth: layout'ta da kontrol.
- 3 sekmeli kapanır kategori navigasyonu (Hizmetler · İş · Sağlık),
  Airbnb tarzı scroll-collapse, Fijaka pattern'i referans. 9 locale string'leri.
  Sekme ikonları ve aktif sekme göstergesi Bölüm 1.5 vurgu renklerini kullanır.
- `/saglik/yakinda` coming-soon sayfası: kısa değer önerisi + doktor bekleme
  listesi formu (`health.provider_waitlist` mini tablosu: isim, branş, şehir,
  telefon, email) — launch öncesi arz toplama.
- Tüm `/saglik` rotalarına `noindex` meta + sitemap exclusion.

**DoD:** Prod build'de flag OFF → sekme yakinda'ya gider, direkt URL 404;
preview'da flag ON → boş sağlık ana sayfası iskeleti render olur. Scroll-collapse
mobil + desktop'ta akıcı (60fps), `prefers-reduced-motion` desteği kanıtlı.
Lighthouse anasayfa skoru mevcut değerin altına düşmemiş.

> **H0 uygulama notları (12.06.2026, PR: feat/health-h0-nav-skeleton):**
> - Slug sistemi mevcut konvansiyonu izledi: internal key İngilizce
>   (`/health`, `/health/coming-soon`, `/career`), per-locale slug'lar
>   `i18n/routing.ts` pathnames map'inde (tr `/saglik`, `/saglik/yakinda`,
>   `/kariyer`; en/de/it/ru/uk/sr/me/ar karşılıkları). Klasörler:
>   `app/[locale]/health/*` + `app/[locale]/career/`.
> - Middleware guard slug setlerini `lib/verticals/slugs.ts` üzerinden
>   pathnames map'inden türetir (drift imkânsız); flag OFF → coming-soon
>   hariç 404 + hreflang Link header'ları da atlanır (noindex karantina).
> - `app/api/health` zaten uptime healthcheck'i — vertical endpoint'leri
>   `app/api/health/*` altına yerleşti; `lib/rateLimit.ts` istisnası exact
>   match'e daraltıldı, `/api/health/*` artık public-form sınıfında.
> - Migration 065 (health şeması + provider_waitlist + service-role-only
>   RPC `health_waitlist_join`) repo'da; prod'a uygulanması Rohat onayı
>   bekliyor — onaya kadar waitlist formu zarif hata durumuna düşer.
> - K1 gereği `/career` kendi coming-soon sayfası (noindex, bekleme listesi yok).

### H1 — Veritabanı Migration + RLS + Cron temeli

**Kapsam:** Bölüm 2'deki şemanın tamamı tek migration olarak; RLS politikaları;
`book_appointment` fonksiyonu; `pg_cron` temizlik job'ları; `health-licenses`
private bucket; seed: ~20 uzmanlık (9 locale çevirili) + 2 test provider.

**DoD:** Migration SQL dosyası repo'da; `supabase db diff` temiz; RLS testleri
(anon ile appointments SELECT → 0 satır, provider başkasının schedule'ını
UPDATE edemiyor) script ile kanıtlı; EXCLUDE constraint'e çakışan 2. insert
→ exclusion_violation kanıtı.

### H2 — Uzman Profilleri + Dizin (public yüz)

**Kapsam:** Sağlık ana sayfası (arama kutusu + uzmanlık kartları + şehir
kısayolları); `[specialty]` liste sayfası (kart: foto, ünvan, branş, diller,
lokasyon, "verified" rozeti, sonraki müsait slot placeholder'ı); uzman profil
sayfası (bio, hizmet+fiyat listesi, harita pin'i, takvim widget alanı şimdilik
placeholder). Yalnız `is_published AND verification_status='approved'` görünür.
**Tasarım: Bölüm 1.4 sadelik sözleşmesine birebir; renk kullanımı Bölüm 1.5
kurallarına tabi.**

**DoD:** 2 seed provider tüm locale'lerde sorunsuz render; ISR/SSG stratejisi
mevcut Glatko sayfa pattern'iyle aynı; mobil ekran görüntüleri; CLS yok.

### H3 — Arama + Filtreler + Geo

**Kapsam:** Branş + şehir + dil + tarih ("bu hafta müsait") + mod filtreleri;
Mapbox geocode ile "yakınımda" (earthdistance radius sorgusu); URL-state senkron
filtreler (paylaşılabilir linkler → SEO sayfaları `[specialty]/[city]`).
Mapbox çağrıları iki katman kuralına tabi (cache + fallback: geo başarısızsa
şehir dropdown'una düş).

**DoD:** Filtre kombinasyonları doğru sonuç döndürüyor (test matrisi);
Mapbox kota alarmı kurulu; boş sonuç durumu tasarlanmış.

### H4 — Availability Engine (slot üretimi) ★ teknik kalp 1/2

**Kapsam:** `lib/health/availability.ts` — saf, test edilebilir fonksiyon:
1. provider+location için `schedules` yükle (weekday + valid aralık)
2. `schedule_overrides` uygula (holiday siler, break böler, extra ekler)
3. `slot_grid_min` ızgarasında aday slotlar üret (süre = service.duration + buffer)
4. `confirmed` randevular + aktif `slot_holds` ile kesişenleri çıkar (tstzrange overlap)
5. `min_notice`, `horizon_days`, `daily_cap` uygula
6. UTC hesapla → `Europe/Podgorica` döndür (DST geçiş günleri test edilecek)
- `GET /api/health/slots?providerId&serviceId&locationId&from&to` (30–60 sn cache
  + Supabase Realtime invalidation hook'u).
- Profil sayfasındaki takvim widget'ı: 7 günlük şerit + saat grid'i, Realtime ile
  canlı slot kaybolması.

**DoD:** Vitest suite: DST ileri/geri günleri, gece yarısı sınırı, break bölme,
override kombinasyonları, daily_cap — en az 15 test case yeşil. Widget'ta iki
tarayıcı açıkken birinin hold'u diğerinde ≤2 sn'de kayboluyor (video/gif kanıt).

### H5 — Booking Flow (hold → OTP → onay) ★ teknik kalp 2/2

**Kapsam:**
- Slot tıkla → `POST /api/health/holds` (session_key cookie ile; EXCLUDE
  constraint hold çakışmasını da engeller) → 5 dk geri sayımlı booking sayfası.
- Hasta formu: ad, telefon, email (ops.), not + **iki ayrı checkbox:**
  (1) sağlık verisi işleme açık rızası — PDPL Md.13 metni linkli, zorunlu;
  (2) pazarlama izni — opsiyonel. Rıza zaman damgaları `patients` tablosuna.
- OTP: Infobip SMS, 6 hane, hash'li saklama, 3 deneme, 10 dk, telefon+IP rate
  limit (mevcut Upstash/rate-limit altyapısı neyse onu kullan, iki katman kuralı).
- Doğrulama sonrası `book_appointment` RPC; `SLOT_TAKEN` → zarif hata + slot yenile.
- Onay sayfası + `manage_token` linki; `reminders_outbox`'a confirm/t24/t2 kayıtları.

**DoD:** k6 concurrency testi: aynı slota 50 paralel istek → tam 1 başarılı,
49 zarif hata (çıktı repo'da); OTP brute-force denemesi rate-limit'e takılıyor;
telefon/email DB'de şifreli (raw SELECT kanıtı); formlar 9 locale'de.

### H6 — Bildirimler (Infobip + Resend pipeline)

**Kapsam:** `pg_cron` her dakika → Edge Function `dispatch-reminders`:
pending + send_at geçmiş kayıtları çek, kanala göre Infobip (SMS öncelik,
WhatsApp opsiyonu) / Resend gönder, `provider_msg_id` yaz, hata → retry_count++
(max 3, sonra failed + Sentry). Şablonlar: confirm, t24, t2, cancelled,
provider_new_booking, followup (T+24h, yalnız özel geri bildirim linki — public
yorum YOK, bkz. K5). Tüm şablonlar hasta locale'inde. İki katman + %80 kota alarmı.

**DoD:** Test randevusunda 6 şablon da gerçek kanaldan ulaştı (ekran görüntüsü);
Infobip down simülasyonunda booking akışı KIRILMIYOR (graceful degrade kanıtı);
iptal → t24/t2 kayıtları `skipped`.

### H7 — Provider Dashboard (doktor tarafı)

**Kapsam:** Onboarding wizard (profil → lisans yükleme private bucket →
lokasyon → hizmetler → haftalık takvim kurulumu → "incelemeye gönder");
dashboard (bugün/yarın randevuları, doluluk oranı); takvim yönetimi (haftalık
grid editörü + tatil/mola/ekstra override'lar); randevu listesi (tamamlandı /
no_show işaretle, sebepli iptal → hastaya otomatik SMS + outbox güncelleme);
manuel randevu ekleme (telefonla arayan hasta için — aynı RPC'den, source='provider');
ayarlar (buffer, min notice, horizon, daily cap).

**DoD:** Uçtan uca: yeni doktor başvurusu → (H8'deki admin onayı mock'lu) →
takvim kurulumu → public profilde slotlar göründü. Mobilde takvim editörü
kullanılabilir (doktorlar telefonda yaşar — ekran görüntüsü).

### H8 — Admin: Doğrulama Kuyruğu + Moderasyon

**Kapsam:** Mevcut Glatko admin'ine "Sağlık" sekmesi: doğrulama kuyruğu
(başvuru detayı + lisans belgesi görüntüleme + onay/sebepli ret → otomatik
bilgilendirme), provider yönetimi (yayından kaldır, tier değiştir), randevu
görünümü (arama/filtre), audit log görüntüleyici, metrik kartları (haftalık
booking, no-show oranı, doluluk, bekleme listesi sayısı).

**DoD:** Onay akışı uçtan uca; ret edilen provider public'te görünmüyor;
her admin aksiyonu audit_log'da.

### H9 — Hasta Self-Service + İptal/Erteleme zinciri

**Kapsam:** `r/[token]` sayfası: randevu özeti, iptal (sebep ops.), erteleme
(slot widget'ı yeniden kullanılır → eski randevu cancelled + yeni booking
atomik); iptal → provider'a bildirim; hesaplı kullanıcılar için "Randevularım"
mevcut Glatko hesap alanına eklenir. Token'lar tek randevuya özel, tahmin
edilemez (24 byte), randevu bitince pasif.

**DoD:** İptal/erteleme zincirinin tüm bildirimleri doğru tetikleniyor;
süresi geçmiş token → zarif hata; erteleme yarışı (aynı anda doktor iptali)
tutarlı sonuçlanıyor.

### H10 — Uyum + Sertleştirme + Cila

**Kapsam:** Gizlilik bildirimi sayfaları (me/en/tr öncelik, kalan locale'ler
çeviri); rıza kayıtları görünümü (admin); veri silme/ihraç talebi akışı (PDPL
15 gün SLA — admin kuyruğu yeterli, otomasyon şart değil); security headers,
tüm health API'lerinde rate limit; Sentry context (PII'siz!); k6 yük testi
tekrarı; erişilebilirlik taraması (takvim widget klavye navigasyonu);
boş/hata/yavaş durum cilası; skeleton loader'lar; OG image'lar.

**DoD:** OWASP hızlı kontrol listesi geçildi; Lighthouse a11y ≥95;
Sentry event'lerinde telefon/email görünmüyor (kanıt).

### H11 — LAUNCH (yalnız Rohat onayıyla)

Bölüm 6'daki checklist'in TAMAMI yeşil olmadan flag açılmaz.

---

## 4. KOD TARAFI UYUM GEREKSİNİMLERİ (özet hatırlatma)

- Sağlık verisi = PDPL Md.13 özel kategori → açık rıza checkbox'ı **ayrı**,
  önceden işaretli DEĞİL, metni AZLP-uyumlu gizlilik bildirimine linkli.
- PII şifreli (pgcrypto), anahtar Supabase Vault'ta; loglarda/Sentry'de PII yok.
- Analytics: sağlık sayfalarında GA4 **kullanma** — mevcut Glatko analytics'i
  neyse, health rotalarında PII-siz event'lerle sınırla (karar K6).
- Doktor profilleri OLGUSAL: süperlatif yok, "en iyi" yok, sıralama-satışı yok,
  "sponsorlu" rozeti yok (LJKCG etik riski). Public yorum sistemi v1'de YOK.
- Telemedicine v1'de YOK (mode kolonu gelecek için duruyor).
- Ödeme v1'de YOK (Glatko Year-1 free modeliyle uyumlu; subscription_tier
  kolonu Faz 2 için hazır).

## 5. HUKUKİ PARALEL TAKİP (kod değil — Rohat/RoNa Legal işi)

| # | İş | Zamanlama |
|---|---|---|
| L1 | AZLP'ye veri sorumlusu kaydı + `zbirka` (randevu DB) bildirimi | H1–H5 arasında |
| L2 | DPO ataması (Rohat veya dışarıdan) + işleme kayıt defteri | L1 ile |
| L3 | LJKCG'ye yazılı görüş başvurusu: olgusal listeleme + fiyat yayını Kodeks'e uygun mu? Yazılı cevabı arşivle | H2 biter bitmez |
| L4 | Stomatološka komora için aynısı (diş hekimleri ayrı oda) | L3 ile |
| L5 | Hasta gizlilik bildirimi + Provider DPA (GDPR Art.28 modelli) taslakları | H10'dan önce |
| L6 | Hasta + provider kullanım koşulları (platform aracıdır, tıbbi hizmet sunmaz maddesi) | H10'dan önce |

## 6. LAUNCH CHECKLIST (flag ON ön şartları — hepsi zorunlu)

- [ ] H0–H10 tüm DoD'ler kapatıldı, main'de
- [ ] k6 concurrency testi son sürümde tekrar geçti (50 paralel → 1 başarı)
- [ ] L1–L6 hukuki kalemler tamam (özellikle LJKCG yazılı cevabı olumlu)
- [ ] En az 8–10 doğrulanmış doktor/diş hekimi yayında, takvimleri dolu
  (boş dizinle launch YOK — Budva/Tivat/Kotor el ile onboarding)
- [ ] Bildirim şablonları gerçek cihazlarda me/en/tr test edildi
- [ ] Infobip + Resend + Mapbox kota alarmları aktif
- [ ] noindex kaldırma + sitemap ekleme hazır (tek PR)
- [ ] Rollback planı: flag'i kapatmak yeterli — veri kaybı yok, test edildi
- [ ] **Rohat'ın yazılı "launch onayı"** ← son adım, bunsuz hiçbir şey

## 7. KARARLAR (✅ 12.06.2026 — Rohat onayı)

| # | Konu | Karar |
|---|---|---|
| K1 | "İş" sekmesi hedefi (v1.3: "& Kariyer" düştü) | Kendi coming-soon sayfası (işçi temin vertical'ı için yer tutucu) |
| K2 | Sağlık sekmesi, prod'da flag OFF iken | "Yakında" sayfası + doktor bekleme listesi formu |
| K3 | İlk provider tipleri ve şehirler | Diş hekimi + pratisyen + psikolog; Budva/Tivat/Kotor → Podgorica |
| K4 | Fiyat gösterimi | Opsiyonel (`price_eur` NULL = gösterme) |
| K5 | Public yorum sistemi | v1'de YOK — yalnız özel geri bildirim; LJKCG cevabı sonrası tekrar değerlendirilir |
| K6 | Health sayfalarında analytics | Mevcut altyapı + PII'siz event'ler; cookie banner metni güncellenir |
| K7 | Renk sistemi | **REVİZE (r2/v1.3):** teal ana marka + tek-kaynak vertical token'ları (Sağlık=`brandHealth` sky, İş=`brandCareer` amber) — tam kurallar Bölüm 1.5 + 1.6 |

Ek karar: **tasarım referansı = Doktortakvimi sadelik sözleşmesi (Bölüm 1.4);**
tüm public health UI'ları bu spesifikasyona uyar.

---

*Sonraki adım: H0 sprint'i Claude Code'a. Bu dosya repo'ya
`docs/health/MASTER_PLAN.md` olarak eklenmeli ve her sprint sonunda güncellenmelidir.*
