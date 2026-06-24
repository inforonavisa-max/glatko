-- 085_boat_taxonomy_cleanup.sql
-- Boat Services taxonomy cleanup (parent_id = de89400f-dae7-4751-8783-5ac31f2c66aa, slug 'boat-services').
--
-- FILES-ONLY: this migration is NOT applied to production by this commit.
-- It was validated against real prod data with a BEGIN ... ROLLBACK dry-run (no commit).
-- Apply to prod only after explicit approval.
--
-- What it does (single transaction):
--   A. Merge 3 duplicate categories into their survivors, then deactivate the dups
--      (defensive: de-dup glatko_pro_services first because of UNIQUE(professional_id, category_id),
--       then repoint pro_services + service_requests, then is_active=false / sort_order=999).
--        engine-service     -> boat-engine-service
--        captain-rental     -> captain-daily
--        electronics-gps    -> electrical-electronics
--   B. Rename 4 categories (slug UNCHANGED — only name/description/translation_status):
--        electrical-electronics : keep the GPS signal
--        sail-canvas            : sailmaker  (sails + canvas/biminis/sprayhoods/covers/upholstery)
--        sailing-rigging        : rigger     (mast + standing/running rigging) — removes the "Yelken/sails" clash
--        captain-daily          : absorbs captain-rental meaning (day + delivery + seasonal)
--   C. Add 3 new categories: polishing-detailing, topside-painting, refit-restoration.
--   D. Re-sort the 15 active children into a logical order.
--   E. Move the 1 orphaned service_request off the inactive 'haul-out' onto the live 'marina-transport'.
--
-- NOTES:
--   * search_text is a GENERATED ALWAYS AS STORED column (migration 014) — it recomputes
--     automatically from name/description, so it is intentionally NOT written here.
--   * translation_status follows the boat-sibling convention (migration 010 header):
--     tr/en/sr/me = verified, de/it/ru/ar/uk = auto.
--   * icon uses the lib/utils/categoryIcon.ts ICON_MAP whitelist (unknown names fall back to Tag).
--     Substitutions vs the original suggestion: polishing 'Sparkles' -> 'SprayCan' (Sparkles is already
--     used by charter-cleaning); topside 'PaintRoller' -> 'Paintbrush' (PaintRoller is not whitelisted);
--     refit 'Hammer' is whitelisted and kept.
--   * de/ar wording incorporates the maritime-terminology review (Überwasserschiff; rigger glossed as
--     "fitting/rigging" not "sail-outfitting" to keep the rigger vs sailmaker distinction).

BEGIN;

-- ---------- PART A: 3 DUP MERGE (defensive: reassign -> deactivate) ----------
-- glatko_pro_services has UNIQUE(professional_id, category_id) -> de-dup first, then repoint.
DO $$
DECLARE p RECORD; s_id uuid; d_id uuid;
BEGIN
  FOR p IN SELECT * FROM (VALUES
      ('engine-service','boat-engine-service'),
      ('captain-rental','captain-daily'),
      ('electronics-gps','electrical-electronics')
  ) AS t(dead, survivor) LOOP
    SELECT id INTO s_id FROM glatko_service_categories WHERE slug = p.survivor;
    SELECT id INTO d_id FROM glatko_service_categories WHERE slug = p.dead;
    IF s_id IS NULL OR d_id IS NULL THEN
      RAISE EXCEPTION 'Slug bulunamadi: % / %', p.survivor, p.dead;
    END IF;
    DELETE FROM glatko_pro_services ps
      WHERE ps.category_id = d_id
        AND EXISTS (SELECT 1 FROM glatko_pro_services x
                    WHERE x.professional_id = ps.professional_id AND x.category_id = s_id);
    UPDATE glatko_pro_services     SET category_id = s_id WHERE category_id = d_id;
    UPDATE glatko_service_requests SET category_id = s_id WHERE category_id = d_id;
    UPDATE glatko_service_categories SET is_active = false, sort_order = 999 WHERE id = d_id;
  END LOOP;
END $$;

-- ---------- PART B: RENAME (slug UNCHANGED, only name/description/translation_status) ----------

-- electrical-electronics: keep the GPS signal
UPDATE glatko_service_categories SET
  name = jsonb_build_object(
    'tr','Elektrik & Elektronik / GPS',
    'en','Marine Electrical & Electronics / GPS',
    'ru','Электрика и электроника / GPS',
    'sr','Електрика и електроника / GPS',
    'me','Elektrika i elektronika / GPS',
    'de','Bordelektrik & Elektronik / GPS',
    'it','Elettrica & elettronica di bordo / GPS',
    'uk','Електрика та електроніка / GPS',
    'ar','كهرباء وإلكترونيات بحرية / GPS'),
  description = jsonb_build_object(
    'tr','Tekne elektrik tesisatı, elektronik cihazlar, GPS/chartplotter, VHF, balık bulucu kurulum ve onarımı.',
    'en','Boat electrical wiring, electronic devices, GPS/chartplotter, VHF, fishfinder install & repair.',
    'ru','Электропроводка лодки, электронные приборы, GPS/картплоттер, УКВ-радиостанция (VHF), эхолот — установка и ремонт.',
    'sr','Електроинсталације пловила, електронски уређаји, GPS/чартплотер, VHF радио, сонар (риболокатор) — уградња и поправка.',
    'me','Elektroinstalacije plovila, elektronski uređaji, GPS/čartploter, VHF radio, sonar (ribolokator) — ugradnja i popravka.',
    'de','Bootselektrik, elektronische Geräte, GPS/Kartenplotter, UKW-Funk (VHF), Echolot — Einbau und Reparatur.',
    'it','Impianto elettrico dell''imbarcazione, dispositivi elettronici, GPS/chartplotter, VHF, ecoscandaglio — installazione e riparazione.',
    'uk','Електропроводка судна, електронні прилади, GPS/картплоттер, VHF-радіо, ехолот — встановлення та ремонт.',
    'ar','تمديدات كهربائية للقارب، أجهزة إلكترونية، GPS/راسمة خرائط، راديو VHF، جهاز سونار لتحديد الأسماك — تركيب وإصلاح.'),
  translation_status = '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb
WHERE slug = 'electrical-electronics';

-- sail-canvas: sailmaker (sail making/repair + canvas/biminis/sprayhoods/covers/upholstery)
UPDATE glatko_service_categories SET
  name = jsonb_build_object(
    'tr','Yelken & Branda',
    'en','Sails & Canvas',
    'ru','Паруса и тенты',
    'sr','Једра и платно',
    'me','Jedra i platno',
    'de','Segel & Persenning',
    'it','Vele e tendalini',
    'uk','Вітрила та тенти',
    'ar','أشرعة وأقمشة'),
  description = jsonb_build_object(
    'tr','Yelken dikim/tamir, branda, tente, sprayhood, bimini, kılıf ve döşeme işleri (yelken ustası / sailmaker).',
    'en','Sail making/repair, canvas, biminis, sprayhoods, covers and upholstery (sailmaker).',
    'ru','Пошив и ремонт парусов, тенты, биминитопы, спрейхуды, чехлы и обивка (мастер по парусам, sailmaker).',
    'sr','Шивење и поправка једара, цераде, бимини, спрејхуд, навлаке и тапацирунг (једрар / sailmaker).',
    'me','Šivenje i popravka jedara, cerade, bimini, sprejhud, navlake i tapaciranje (jedrar / sailmaker).',
    'de','Anfertigung/Reparatur von Segeln, Persenninge, Bimini, Sprayhoods, Abdeckungen und Polster (Segelmacher).',
    'it','Confezione/riparazione vele, teloni, biminis, sprayhood, coperture e tappezzeria (velaio / sailmaker).',
    'uk','Пошиття та ремонт вітрил, тенти, біміні, спрейхуди, чохли та оббивка (вітрильний майстер, sailmaker).',
    'ar','تفصيل وإصلاح الأشرعة، أقمشة، مظلات بيميني، حواجز رذاذ (سبراي هود)، أغطية وتنجيد (صانع أشرعة / sailmaker).'),
  translation_status = '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb
WHERE slug = 'sail-canvas';

-- sailing-rigging: rigger — removes the "Yelken/sails" clash with sail-canvas
UPDATE glatko_service_categories SET
  name = jsonb_build_object(
    'tr','Direk & Armadora',
    'en','Rigging & Mast',
    'ru','Такелаж и мачта',
    'sr','Јарбол и снаст (ригинг)',
    'me','Jarbol i snast (rigging)',
    'de','Rigg & Mast',
    'it','Attrezzatura e albero (rigging)',
    'uk','Такелаж і щогла',
    'ar','الصاري والتجهيزات (التجهيز الثابت والمتحرك)'),
  description = jsonb_build_object(
    'tr','Sabit ve hareketli arma, çarmıh/ıstralya, halat (halyard/skota), direk kurulum ve rig ayarı (armador / rigger).',
    'en','Standing & running rigging, shrouds/stays, halyards/sheets, mast stepping and rig tuning (rigger).',
    'ru','Стоячий и бегучий такелаж, ванты/штаги, фалы/шкоты, установка мачты и настройка такелажа (такелажник, rigger).',
    'sr','Стајаћи и покретни ригинг, сартије/припоне, подизачи (фалови)/шкоте, постављање јарбола и подешавање ригинга (ригер).',
    'me','Stajaći i pokretni rigging, sartije/pripone, falovi/škote, postavljanje jarbola i podešavanje rigginga (riger).',
    'de','Stehendes und laufendes Gut, Wanten/Stagen, Fallen/Schoten, Mast stellen und Rigg-Trimm (Rigger).',
    'it','Sartiame fisso e manovre correnti, sartie/stralli, drizze/scotte, alberatura e messa a punto del rigging (rigger).',
    'uk','Стоячий і рухомий такелаж, ванти/штаги, фали/шкоти, встановлення щогли та налаштування такелажу (такелажник, rigger).',
    'ar','تجهيز ثابت ومتحرك، حبال جانبية/أمامية، حبال رفع/شد الأشرعة، تركيب الصاري وضبط التجهيز (فني التجهيز / rigger).'),
  translation_status = '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb
WHERE slug = 'sailing-rigging';

-- captain-daily: absorb captain-rental meaning (day + delivery + seasonal)
UPDATE glatko_service_categories SET
  name = jsonb_build_object(
    'tr','Kaptan Kiralama (Günlük/Sefer)',
    'en','Captain Hire (Day/Delivery)',
    'ru','Аренда капитана (день/перегон)',
    'sr','Изнајмљивање капетана (дневно / допрема пловила)',
    'me','Iznajmljivanje kapetana (dnevno / dopremanje plovila)',
    'de','Skipper/Kapitän mieten (Tag/Überführung)',
    'it','Noleggio capitano (giornaliero/trasferimento)',
    'uk','Оренда капітана (день/перегін)',
    'ar','استئجار قبطان (يومي / لرحلة تسليم)'),
  description = jsonb_build_object(
    'tr','Günlük skipper, charter günü kaptanı, tekne teslim (delivery) ve sezonluk kaptan hizmeti.',
    'en','Day skipper, charter day captain, delivery and seasonal captain services.',
    'ru','Шкипер на день, капитан на день чартера, перегон (delivery) и сезонные услуги капитана.',
    'sr','Скипер на дан, капетан за дан чартера, допрема пловила (деливери) и сезонске капетанске услуге.',
    'me','Skiper na dan, kapetan za dan čartera, dopremanje plovila (delivery) i sezonske kapetanske usluge.',
    'de','Tagesskipper, Charter-Tageskapitän, Überführung (Delivery) und saisonaler Kapitänsdienst.',
    'it','Skipper giornaliero, capitano per giornata di charter, trasferimento (delivery) e servizio capitano stagionale.',
    'uk','Шкіпер на день, капітан на день чартеру, перегін (delivery) та сезонні послуги капітана.',
    'ar','ربان ليوم واحد، قبطان ليوم تأجير، رحلة تسليم القارب (delivery)، وخدمة قبطان موسمية.'),
  translation_status = '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb
WHERE slug = 'captain-daily';

-- ---------- PART C: 3 NEW CATEGORIES ----------
INSERT INTO glatko_service_categories (id, parent_id, slug, name, description, icon, sort_order, is_active, translation_status)
VALUES
 (gen_random_uuid(), 'de89400f-dae7-4751-8783-5ac31f2c66aa', 'polishing-detailing',
  jsonb_build_object(
    'tr','Cila & Yüzey Bakımı (Polish)',
    'en','Polishing & Detailing',
    'ru','Полировка и детейлинг',
    'sr','Полирање и детејлинг',
    'me','Poliranje i detejling',
    'de','Politur & Aufbereitung',
    'it','Lucidatura e detailing',
    'uk','Полірування та детейлінг',
    'ar','تلميع وعناية بالأسطح'),
  jsonb_build_object(
    'tr','Düzenli cila, pasta, oksidasyon giderme, wax/seramik koruma ve detailing. (Hasar tamiri için Jel-kot tamiri kategorisi.)',
    'en','Routine polishing, compounding, oxidation removal, wax/ceramic protection, detailing. (For damage repair see Gelcoat repair.)',
    'ru','Регулярная полировка, абразивная паста, удаление окисления, защита воском/керамикой, детейлинг. (Ремонт повреждений — категория «Ремонт гелькоута».)',
    'sr','Редовно полирање, абразивна паста, уклањање оксидације, заштита воском/керамиком, детејлинг. (За поправку оштећења види Поправка гелкота.)',
    'me','Redovno poliranje, abrazivna pasta, uklanjanje oksidacije, zaštita voskom/keramikom, detejling. (Za popravku oštećenja vidi Popravka gelkota.)',
    'de','Regelmäßige Politur, Schleifpaste, Oxidationsentfernung, Wachs-/Keramikversiegelung, Aufbereitung. (Für Schäden siehe Gelcoat-Reparatur.)',
    'it','Lucidatura periodica, pasta abrasiva, rimozione dell''ossidazione, protezione cera/ceramica, detailing. (Per riparazioni vedi Riparazione gelcoat.)',
    'uk','Регулярне полірування, абразивна паста, усунення окислення, захист воском/керамікою, детейлінг. (Ремонт пошкоджень — категорія «Ремонт гелькоату».)',
    'ar','تلميع دوري، معجون كاشط، إزالة الأكسدة، حماية بالشمع/السيراميك، عناية بالتفاصيل. (لإصلاح الأضرار راجع فئة إصلاح الجل كوت.)'),
  'SprayCan', 3, true,
  '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb),
 (gen_random_uuid(), 'de89400f-dae7-4751-8783-5ac31f2c66aa', 'topside-painting',
  jsonb_build_object(
    'tr','Tekne Boyama (Üst Yüzey)',
    'en','Topside Painting & Coating',
    'ru','Покраска надводной части',
    'sr','Бојење надводног дела',
    'me','Bojenje nadvodnog dijela',
    'de','Lackierung Überwasserschiff',
    'it','Verniciatura opera morta',
    'uk','Фарбування надводної частини',
    'ar','طلاء الجزء العلوي (فوق خط الماء)'),
  jsonb_build_object(
    'tr','Su üstü gövde ve üstyapı boyama, topcoat/Awlgrip, sprey boya, astar. (Su altı için Antifouling kategorisi.)',
    'en','Above-waterline hull & superstructure painting, topcoat/Awlgrip, spray, primer. (For below the waterline see Antifouling.)',
    'ru','Покраска надводной части корпуса и надстройки, топкоут/Awlgrip, напыление, грунт. (Подводная часть — категория «Антифоулинг».)',
    'sr','Бојење надводног дела трупа и надградње, топкот/Awlgrip, спреј, прајмер. (За подводни део види Антифоулинг.)',
    'me','Bojenje nadvodnog dijela trupa i nadgradnje, topkot/Awlgrip, sprej, prajmer. (Za podvodni dio vidi Antifouling.)',
    'de','Lackierung von Rumpf und Aufbauten über der Wasserlinie, Topcoat/Awlgrip, Spritzlack, Grundierung. (Unter Wasser siehe Antifouling.)',
    'it','Verniciatura di opera morta e sovrastrutture, smalto/Awlgrip, a spruzzo, primer. (Per l''opera viva vedi Antivegetativa.)',
    'uk','Фарбування надводної частини корпусу та надбудови, топкоут/Awlgrip, напилення, ґрунт. (Підводна частина — категорія «Антифоулінг».)',
    'ar','طلاء بدن القارب فوق خط الماء والبنية الفوقية، طلاء نهائي/Awlgrip، رش، أساس (برايمر). (لما تحت خط الماء راجع فئة الطلاء الواقي/Antifouling.)'),
  'Paintbrush', 5, true,
  '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb),
 (gen_random_uuid(), 'de89400f-dae7-4751-8783-5ac31f2c66aa', 'refit-restoration',
  jsonb_build_object(
    'tr','Refit & Tadilat',
    'en','Refit & Restoration',
    'ru','Рефит и реставрация',
    'sr','Рефит и реставрација',
    'me','Refit i restauracija',
    'de','Refit & Restaurierung',
    'it','Refit e restauro',
    'uk','Рефіт та реставрація',
    'ar','تجديد شامل وترميم'),
  jsonb_build_object(
    'tr','Kapsamlı yenileme ve restorasyon, büyük tadilat, marangozluk/teak, iç-dış yenileme projeleri.',
    'en','Comprehensive refit & restoration, major works, joinery/teak, interior & exterior projects.',
    'ru','Комплексный рефит и реставрация, крупные работы, столярные работы/тик, проекты по интерьеру и экстерьеру.',
    'sr','Свеобухватни рефит и реставрација, велики радови, столарија/тиковина, пројекти ентеријера и екстеријера.',
    'me','Sveobuhvatni refit i restauracija, veliki radovi, stolarija/tikovina, projekti enterijera i eksterijera.',
    'de','Umfassendes Refit & Restaurierung, Großarbeiten, Tischlerei/Teak, Innen- und Außenprojekte.',
    'it','Refit e restauro completo, lavori importanti, falegnameria/teak, progetti interni ed esterni.',
    'uk','Комплексний рефіт та реставрація, великі роботи, столярні роботи/тик, проєкти інтер''єру та екстер''єру.',
    'ar','تجديد وترميم شامل، أعمال كبرى، نجارة/خشب الساج (تيك)، مشاريع داخلية وخارجية.'),
  'Hammer', 8, true,
  '{"tr":"verified","en":"verified","sr":"verified","me":"verified","de":"auto","it":"auto","ru":"auto","ar":"auto","uk":"auto"}'::jsonb);

-- ---------- PART D: LOGICAL SORT ORDER FOR THE 15 ACTIVE CHILDREN ----------
UPDATE glatko_service_categories AS c SET sort_order = v.so
FROM (VALUES
  ('hull-cleaning',1),('charter-cleaning',2),('polishing-detailing',3),
  ('antifouling',4),('topside-painting',5),('gelcoat-repair',6),
  ('boat-engine-service',7),('refit-restoration',8),
  ('sail-canvas',9),('sailing-rigging',10),
  ('electrical-electronics',11),('captain-daily',12),
  ('winter-storage',13),('marina-transport',14),('insurance-survey',15)
) AS v(slug, so)
WHERE c.slug = v.slug;

-- ---------- PART E: rehome the 1 orphaned request off inactive 'haul-out' -> live 'marina-transport' ----------
UPDATE glatko_service_requests SET category_id =
  (SELECT id FROM glatko_service_categories WHERE slug = 'marina-transport')
WHERE category_id = (SELECT id FROM glatko_service_categories WHERE slug = 'haul-out');

COMMIT;
