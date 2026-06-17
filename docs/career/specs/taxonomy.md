# Career Vertical — Sector→Trade Taxonomy + Facet Vocabularies (BUILD SPEC)

> Authoritative SSOT for the talent-pool taxonomy. Downstream agents (seed migration,
> `lib/kariyer/category-icons.ts`, filter UI, worker profile picker) consume THIS file.
> Mirrors health's specialty taxonomy (`067_health_h1_seed.sql` + `lib/saglik/specialty-icons.ts`).
> Accent for every trade/sector icon = **amber-600 (`brandCareer`)** wherever health uses sky-600.
> Locales (9, every label below has all of them): tr (default) · en · de · it · ru · uk · sr · me · ar.
> `me`/`sr` are written in **Latin** script (matches the rest of the Glatko UI). `ar` is RTL.

## How this maps to the data model (no guesswork)
- **Sectors** are a real seeded table (`career.sectors`, slug + `name_jsonb`, migration `078`). The two
  rows (`construction`, `hospitality`) already exist — DO NOT re-seed; this file owns the **trades under them.**
- **Trades** are NOT a separate seeded table today. A trade slug is the value written to
  `career.worker_profiles.trade` (text) and rendered on pool cards / sector-detail trade tiles. When a
  `career.trades` table is added, seed it from §1 (cols: `sector_slug`, `slug`, `name_jsonb`, `skill_tier`,
  `sort_order`); the icon map stays in code (lucide isn't a DB concern), exactly like health.
- **Skill tier** → `career.worker_profiles.skill_tier` (text). **Region** → `.region`. **Experience band** →
  `.experience_band`. **Age band** → `.age_band`. **Languages** → `.languages text[]`. **Readiness** →
  `.readiness_score int` (0–100), bucketed for display per §6. All are filter facets on `/career/pool`.
- Icons: extend `lib/kariyer/category-icons.ts` `TRADE_ICON_BY_SLUG` to cover all 28 slugs below
  (it currently maps only ~12). Unmapped slug → `Briefcase` fallback (already wired). Every lucide name
  in §1 is verified to exist in the installed `lucide-react`.

---

## §1 — TRADES (slug · 9-locale label · lucide icon · skill tier)

### Sector: `construction` (İnşaat) — 15 trades
| slug | tr | en | de | it | ru | uk | sr | me | ar | icon | tier |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `mason` | Duvarcı | Mason / Bricklayer | Maurer | Muratore | Каменщик | Муляр | Zidar | Zidar | بنّاء | `Hammer` | skilled |
| `welder` | Kaynakçı | Welder | Schweißer | Saldatore | Сварщик | Зварювальник | Varilac | Varilac | لحّام | `Flame` | skilled |
| `steel-fixer` | Demir Bağlama Ustası | Steel Fixer | Eisenflechter | Ferraiolo | Арматурщик | Арматурник | Armirač | Armirač | حدّاد تسليح | `Grid2x2` | skilled |
| `electrician` | Elektrikçi | Electrician | Elektriker | Elettricista | Электрик | Електрик | Električar | Električar | كهربائي | `Plug` | skilled |
| `plumber` | Tesisatçı | Plumber | Klempner | Idraulico | Сантехник | Сантехнік | Vodoinstalater | Vodoinstalater | سبّاك | `Wrench` | skilled |
| `carpenter` | Marangoz | Carpenter | Zimmermann | Carpentiere | Плотник | Тесляр | Tesar | Tesar | نجّار | `Drill` | skilled |
| `painter` | Boyacı | Painter | Maler | Imbianchino | Маляр | Маляр | Moler | Moler | دهّان | `PaintRoller` | semi-skilled |
| `plasterer` | Sıvacı | Plasterer | Verputzer | Intonacatore | Штукатур | Штукатур | Fasader | Fasader | لبّاخ | `Layers` | semi-skilled |
| `tiler` | Fayansçı | Tiler | Fliesenleger | Piastrellista | Плиточник | Плиточник | Keramičar | Keramičar | مبلّط | `Grid3x3` | semi-skilled |
| `scaffolder` | İskele Kurucu | Scaffolder | Gerüstbauer | Ponteggiatore | Монтажник лесов | Монтажник риштувань | Skelar | Skelar | عامل سقالات | `Frame` | semi-skilled |
| `crane-operator` | Vinç Operatörü | Crane Operator | Kranführer | Gruista | Крановщик | Кранівник | Kranista | Kranista | مشغّل رافعة | `TowerControl` | skilled |
| `heavy-equipment-operator` | Ağır İş Makinesi Operatörü | Heavy Equipment Operator | Baumaschinenführer | Operatore macchine pesanti | Машинист спецтехники | Оператор спецтехніки | Rukovalac građevinskih mašina | Rukovalac građevinskih mašina | مشغّل معدّات ثقيلة | `Forklift` | skilled |
| `general-labourer` | Düz İşçi / Yardımcı | General Helper / Labourer | Bauhelfer | Manovale | Разнорабочий | Різноробочий | Fizički radnik | Fizički radnik | عامل بناء | `HardHat` | unskilled |
| `site-foreman` | Şantiye Şefi | Foreman / Site Supervisor | Polier | Capocantiere | Прораб | Виконроб | Poslovođa gradilišta | Poslovođa gradilišta | مشرف موقع | `ClipboardList` | skilled |
| `hvac-technician` | İklimlendirme Teknisyeni | HVAC Technician | HLK-Techniker | Tecnico HVAC | Техник ОВиК | Технік ОВКВ | HVAC tehničar | HVAC tehničar | فني تكييف وتبريد | `Wind` | skilled |

### Sector: `hospitality` (Turizm ve Otelcilik) — 13 trades
| slug | tr | en | de | it | ru | uk | sr | me | ar | icon | tier |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `waiter` | Garson | Waiter / Server | Kellner | Cameriere | Официант | Офіціант | Konobar | Konobar | نادل | `HandPlatter` | semi-skilled |
| `housekeeper` | Kat Görevlisi | Housekeeper / Room Attendant | Zimmermädchen | Cameriere ai piani | Горничная | Покоївка | Sobarica | Sobarica | عاملة تنظيف غرف | `BedDouble` | unskilled |
| `cook` | Aşçı | Cook / Line Cook | Koch | Cuoco | Повар | Кухар | Kuvar | Kuvar | طبّاخ | `Soup` | semi-skilled |
| `chef` | Şef / Sous Şef | Chef / Sous-Chef | Küchenchef | Chef / Sous-chef | Шеф-повар | Шеф-кухар | Šef kuhinje | Šef kuhinje | شيف | `ChefHat` | skilled |
| `bartender` | Barmen | Bartender | Barkeeper | Barista (bar) | Бармен | Бармен | Barmen | Barmen | ساقي / بارمان | `Martini` | semi-skilled |
| `barista` | Barista | Barista | Barista | Barista | Бариста | Бариста | Barista | Barista | باريستا | `Coffee` | semi-skilled |
| `receptionist` | Resepsiyonist | Receptionist / Front Desk | Rezeptionist | Receptionist | Администратор ресепшн | Адміністратор рецепції | Recepcioner | Recepcioner | موظف استقبال | `BellRing` | semi-skilled |
| `kitchen-porter` | Bulaşıkçı / Mutfak Yardımcısı | Kitchen Porter / Steward | Küchenhilfe | Lavapiatti | Посудомойщик | Кухонний робітник | Pomoćnik u kuhinji | Pomoćnik u kuhinji | عامل مطبخ | `Utensils` | unskilled |
| `concierge` | Konsiyerj | Concierge | Concierge | Concierge | Консьерж | Консьєрж | Konsijerž | Konsijerž | كونسيرج | `ConciergeBell` | skilled |
| `bellhop` | Komi / Bagaj Görevlisi | Bellhop | Page / Hotelboy | Fattorino | Посыльный | Носій багажу | Nosač prtljaga | Nosač prtljaga | حامل أمتعة | `Luggage` | unskilled |
| `fb-supervisor` | Yiyecek-İçecek Süpervizörü | F&B Supervisor | F&B-Supervisor | Supervisore F&B | Супервайзер F&B | Супервайзер F&B | Supervizor hrane i pića | Supervizor hrane i pića | مشرف أغذية ومشروبات | `ClipboardCheck` | skilled |
| `spa-therapist` | Spa Terapisti | Spa Therapist | Spa-Therapeut | Terapista Spa | Спа-терапевт | Спа-терапевт | Spa terapeut | Spa terapeut | معالج سبا | `Flower2` | skilled |

> Both sectors share the `general-labourer`/unskilled bottom tier conceptually; keep `general-labourer`
> under construction only. Slugs are stable identity keys — never localize a slug.

---

## §2 — FACET: Region (source-region framing, NOT exact country)
Shown as region only — exact country is gated PII. Stored in `career.worker_profiles.region`.
| slug | tr | en | de | it | ru | uk | sr | me | ar |
|---|---|---|---|---|---|---|---|---|---|
| `far-east` | Uzak Doğu | Far East | Ferner Osten | Estremo Oriente | Дальний Восток | Далекий Схід | Daleki istok | Daleki istok | الشرق الأقصى |
| `middle-east` | Orta Doğu | Middle East | Naher Osten | Medio Oriente | Ближний Восток | Близький Схід | Bliski istok | Bliski istok | الشرق الأوسط |
| `africa` | Afrika | Africa | Afrika | Africa | Африка | Африка | Afrika | Afrika | إفريقيا |

## §3 — FACET: Experience band (years)
Stored in `career.worker_profiles.experience_band`. Display label is range; slug is stable.
| slug | label (en, others mirror as "X–Y yrs"/"X+ yrs" localized) |
|---|---|
| `exp-0-1` | 0–1 yrs (tr "0–1 yıl", de "0–1 J.", ar "0–1 سنة", …) |
| `exp-1-3` | 1–3 yrs |
| `exp-3-5` | 3–5 yrs |
| `exp-5-10` | 5–10 yrs |
| `exp-10-plus` | 10+ yrs |
> "yrs" word is the only localized token: tr `yıl` · de `J.` · it `anni` · ru `лет` · uk `р.` · sr/me `god.` · ar `سنة`.

## §4 — FACET: Age band
Stored in `career.worker_profiles.age_band`. Pure numeric ranges — no localization needed except the
"+" suffix reads naturally everywhere. NEVER show exact DOB (gated PII).
| slug | label |
|---|---|
| `age-18-24` | 18–24 |
| `age-25-34` | 25–34 |
| `age-35-44` | 35–44 |
| `age-45-plus` | 45+ |

## §5 — FACET: Languages (common worker languages)
Stored as `career.worker_profiles.languages text[]` (BCP-47-ish codes below). Multi-select filter (OR).
These are the worker-spoken languages, distinct from the 9 UI locales.
| code | en name | native/endonym (display) |
|---|---|---|
| `en` | English | English |
| `ar` | Arabic | العربية |
| `hi` | Hindi | हिन्दी |
| `ne` | Nepali | नेपाली |
| `bn` | Bengali | বাংলা |
| `tl` | Tagalog | Tagalog |
| `ur` | Urdu | اردو |
| `ru` | Russian | Русский |
| `tr` | Turkish | Türkçe |
> Render each language label localized into the active UI locale via `Intl.DisplayNames(locale,{type:'language'})`
> with the endonym as fallback. `hi`/`ne`/`bn`/`ur` need their own list entries (not all are UI locales).

## §6 — FACET: Readiness score bands
`career.worker_profiles.readiness_score` is an int 0–100 (composite: profile completeness + verified docs +
skills + language + deployment-readiness, per plan §5). Bucket for the filter + the card badge color:
| slug | range | en label | badge accent |
|---|---|---|---|
| `readiness-low` | 0–39 | Building profile | neutral / slate |
| `readiness-medium` | 40–69 | Getting ready | amber-400 |
| `readiness-high` | 70–89 | Deployment ready | amber-600 (`brandCareer`) |
| `readiness-verified` | 90–100 | Fully verified & ready | amber-700 + check |
> Sort default on `/career/pool` = readiness desc. The amber ramp visually reinforces the vertical accent;
> low band stays neutral so it doesn't falsely signal endorsement.

## §7 — FACET: Skill tier (cross-cutting)
Three tiers, used as both a worker attribute (§1 `tier` column) and a pool filter.
| slug | tr | en | de | it | ru | uk | sr | me | ar |
|---|---|---|---|---|---|---|---|---|---|
| `skilled` | Nitelikli | Skilled | Fachkraft | Qualificato | Квалифицированный | Кваліфікований | Kvalifikovan | Kvalifikovan | ماهر |
| `semi-skilled` | Yarı Nitelikli | Semi-Skilled | Angelernt | Semi-qualificato | Полуквалифицированный | Напівкваліфікований | Polukvalifikovan | Polukvalifikovan | شبه ماهر |
| `unskilled` | Niteliksiz | Unskilled | Ungelernt | Non qualificato | Неквалифицированный | Некваліфікований | Nekvalifikovan | Nekvalifikovan | غير ماهر |

---

## §8 — Edge cases / rules for the implementer
- **Missing locale string** → fall back to `en`, then to the slug (mirror health's jsonb-lookup pattern). Never blank.
- **Unmapped trade slug in the icon map** → `Briefcase` (already the fallback). Adding a trade must not break the UI.
- **RTL (`ar`)**: trade/facet rows render right-aligned; lucide icon sits on the right of the label. No mirrored glyphs.
- **Trade ⊂ sector integrity**: a worker's `trade` must belong to their `sector`. Validate at write time (RPC/form),
  not just UI — a `chef` under `construction` is a data bug.
- **Tier vs trade consistency**: `§1.tier` is the trade's *default*; an individual worker's `skill_tier` may differ
  (a `painter` with cert can be `skilled`). The worker's own value wins on the card; the trade default seeds the form.
- **`me`/`sr` Latin only** — no Cyrillic anywhere in these labels (matches `lib/kariyer/intl.ts` → `sr-Latn`).
- **Slugs are forever**: changing a slug orphans every `worker_profiles.trade`/`.region`/etc. row. Add, never rename.
- **No worker-facing fee/price token** anywhere in this taxonomy (RULE R7 — ILO Employer Pays).
