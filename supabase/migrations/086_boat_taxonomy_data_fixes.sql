-- 086_boat_taxonomy_data_fixes.sql
-- Follow-up data fixes after 085 (boat-services taxonomy cleanup).
--
-- FILES-ONLY: NOT applied to production by this commit. Validated against real
-- prod data with a BEGIN ... ROLLBACK dry-run; apply only after approval.
-- Applied via Supabase apply_migration (wraps the whole file in one atomic
-- transaction — same convention as 058/063/084, so no explicit BEGIN/COMMIT).
--
-- Every statement is IDEMPOTENT (guarded), so a re-run is a safe no-op:
--   A. Correct the one request 085 PART E mis-homed: an electrical-repair job
--      ("Elktricarske popravke", expired) was swept onto marina-transport by the
--      blanket haul-out→marina move. Re-home it to electrical-electronics.
--      Guard: only moves if it is still on marina-transport.
--   B. Backfill icons for 4 active children still rendering the Tag fallback.
--      Guard: only sets where icon IS NULL. Names verified against the
--      lib/utils/categoryIcon.ts ICON_MAP whitelist (Cable added to the map in
--      this same PR; Wrench/Truck/ClipboardCheck already present).
--   C. Backfill translation_status for 3 pre-existing children left at '{}'.
--      Names are already 9/9; this only sets the status to the boat-sibling
--      convention (tr/en/sr/me=verified, de/it/ru/ar/uk=auto).
--      Guard: only where translation_status = '{}'.
--   D. Refresh the boat-services PARENT description (was a short, stale 4-item
--      line-up that still named the now-merged "motor servis"/"kaptan kiralama"
--      and is rendered as the category hero subtitle) with the full current
--      service line-up, 9 locales. search_text is a GENERATED column and
--      refreshes automatically.

-- ---------- PART A: re-home the mis-categorized electrical request ----------
UPDATE glatko_service_requests
SET category_id = (SELECT id FROM glatko_service_categories WHERE slug = 'electrical-electronics')
WHERE id = 'f4f9c08a-5c2b-4b06-bde2-4132f1f0a6ea'
  AND category_id = (SELECT id FROM glatko_service_categories WHERE slug = 'marina-transport');

-- ---------- PART B: icon backfill (whitelist-verified, only where NULL) ----------
UPDATE glatko_service_categories AS c SET icon = v.icon
FROM (VALUES
  ('gelcoat-repair','Wrench'),         -- surface/repair
  ('sailing-rigging','Cable'),         -- rigging = wire/rope (distinct from sail-canvas=Wind)
  ('marina-transport','Truck'),        -- haul-out is inactive, no UI icon clash
  ('insurance-survey','ClipboardCheck') -- survey/inspection
) AS v(slug, icon)
WHERE c.slug = v.slug AND c.icon IS NULL;

-- ---------- PART C: translation_status backfill (only where empty) ----------
UPDATE glatko_service_categories
SET translation_status = jsonb_build_object(
  'tr','verified','en','verified','sr','verified','me','verified',
  'ru','auto','de','auto','it','auto','uk','auto','ar','auto')
WHERE slug IN ('gelcoat-repair','marina-transport','insurance-survey')
  AND translation_status = '{}'::jsonb;

-- ---------- PART D: refresh boat-services parent description (9 locales) ----------
UPDATE glatko_service_categories
SET description = jsonb_build_object(
  'tr','Antifouling, tekne boyama, motor servisi, refit & tadilat, cila & yüzey bakımı, kaptan kiralama, elektronik/GPS, yelken & arma, kışlama ve sigorta sörveyi — teknenizin tüm bakım ve servis ihtiyaçları.',
  'en','Antifouling, topside painting, engine service, refit & restoration, polishing & detailing, captain hire, electronics/GPS, sails & rigging, winter storage and insurance survey — complete boat care and service.',
  'ru','Антифоулинг, покраска надводной части, сервис двигателя, рефит и реставрация, полировка и детейлинг, аренда капитана, электроника/GPS, паруса и такелаж, зимнее хранение и страховой осмотр — полный уход и сервис для вашей лодки.',
  'de','Antifouling, Lackierung des Überwasserschiffs, Motorservice, Refit & Restaurierung, Politur & Aufbereitung, Skipper mieten, Elektronik/GPS, Segel & Rigg, Winterlager und Versicherungsgutachten — komplette Bootspflege und -wartung.',
  'it','Antivegetativa, verniciatura dell''opera morta, servizio motore, refit e restauro, lucidatura e detailing, noleggio capitano, elettronica/GPS, vele e attrezzatura, rimessaggio invernale e perizia assicurativa — cura e assistenza completa della tua imbarcazione.',
  'me','Antifouling, bojenje nadvodnog dijela, servis motora, refit i restauracija, poliranje i detejling, iznajmljivanje kapetana, elektronika/GPS, jedra i snast, zimovanje i pregled za osiguranje — kompletna njega i servis vašeg plovila.',
  'sr','Антифоулинг, бојење надводног дела, сервис мотора, рефит и реставрација, полирање и детејлинг, изнајмљивање капетана, електроника/GPS, једра и снаст, зимовање и преглед за осигурање — комплетна нега и сервис вашег пловила.',
  'uk','Антифоулінг, фарбування надводної частини, сервіс двигуна, рефіт і реставрація, полірування та детейлінг, оренда капітана, електроніка/GPS, вітрила і такелаж, зимове зберігання та страховий огляд — повний догляд і сервіс вашого судна.',
  'ar','الطلاء الواقي (Antifouling)، طلاء الجزء العلوي، صيانة المحرك، تجديد وترميم، تلميع وعناية بالأسطح، استئجار قبطان، إلكترونيات/GPS، أشرعة وتجهيزات، تخزين شتوي ومسح تأميني — رعاية وخدمة كاملة لقاربك.')
WHERE slug = 'boat-services';
