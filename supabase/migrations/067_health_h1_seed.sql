-- ═══════════════════════════════════════════════════════════════════════════
-- 067: H1 seed — 20 uzmanlık (9/9 locale) + 2 test provider (idempotent)
-- ═══════════════════════════════════════════════════════════════════════════
-- 066 (şema) ÜZERİNE veri. Tamamı idempotent (ON CONFLICT DO NOTHING + deterministik
-- UUID'ler) → prod'a tekrar tekrar uygulanabilir. Test provider'lar approved+published,
-- her biri 1 klinik + 1 lokasyon + 1 hizmet + Pzt–Cum takvim → H2 boş ekranla başlamaz.
-- Rollback: bu satırların id/slug'larını sil (ya da 066 rollback'i cascade ile kapsar).

insert into health.specialties (slug, names, sort_order) values
 ('dis-hekimi',       '{"tr":"Diş Hekimi","en":"Dentist","de":"Zahnarzt","it":"Dentista","ru":"Стоматолог","uk":"Стоматолог","sr":"Stomatolog","me":"Stomatolog","ar":"طبيب أسنان"}'::jsonb, 10),
 ('aile-hekimi',      '{"tr":"Aile Hekimi","en":"General Practitioner","de":"Allgemeinarzt","it":"Medico di base","ru":"Семейный врач","uk":"Сімейний лікар","sr":"Lekar opšte prakse","me":"Ljekar opšte prakse","ar":"طبيب عام"}'::jsonb, 20),
 ('psikolog',         '{"tr":"Psikolog","en":"Psychologist","de":"Psychologe","it":"Psicologo","ru":"Психолог","uk":"Психолог","sr":"Psiholog","me":"Psiholog","ar":"أخصائي نفسي"}'::jsonb, 30),
 ('psikiyatr',        '{"tr":"Psikiyatr","en":"Psychiatrist","de":"Psychiater","it":"Psichiatra","ru":"Психиатр","uk":"Психіатр","sr":"Psihijatar","me":"Psihijatar","ar":"طبيب نفسي"}'::jsonb, 40),
 ('dermatolog',       '{"tr":"Dermatolog","en":"Dermatologist","de":"Hautarzt","it":"Dermatologo","ru":"Дерматолог","uk":"Дерматолог","sr":"Dermatolog","me":"Dermatolog","ar":"طبيب جلدية"}'::jsonb, 50),
 ('kardiyolog',       '{"tr":"Kardiyolog","en":"Cardiologist","de":"Kardiologe","it":"Cardiologo","ru":"Кардиолог","uk":"Кардіолог","sr":"Kardiolog","me":"Kardiolog","ar":"طبيب قلب"}'::jsonb, 60),
 ('cocuk-doktoru',    '{"tr":"Çocuk Doktoru","en":"Pediatrician","de":"Kinderarzt","it":"Pediatra","ru":"Педиатр","uk":"Педіатр","sr":"Pedijatar","me":"Pedijatar","ar":"طبيب أطفال"}'::jsonb, 70),
 ('kadin-dogum',      '{"tr":"Kadın Hastalıkları ve Doğum","en":"Gynecologist","de":"Frauenarzt","it":"Ginecologo","ru":"Гинеколог","uk":"Гінеколог","sr":"Ginekolog","me":"Ginekolog","ar":"طبيب نساء وتوليد"}'::jsonb, 80),
 ('goz-doktoru',      '{"tr":"Göz Doktoru","en":"Ophthalmologist","de":"Augenarzt","it":"Oculista","ru":"Офтальмолог","uk":"Офтальмолог","sr":"Oftalmolog","me":"Oftalmolog","ar":"طبيب عيون"}'::jsonb, 90),
 ('kbb',              '{"tr":"Kulak Burun Boğaz","en":"ENT Specialist","de":"HNO-Arzt","it":"Otorinolaringoiatra","ru":"Отоларинголог","uk":"Отоларинголог","sr":"Otorinolaringolog","me":"Otorinolaringolog","ar":"طبيب أنف وأذن وحنجرة"}'::jsonb, 100),
 ('ortopedi',         '{"tr":"Ortopedi ve Travmatoloji","en":"Orthopedist","de":"Orthopäde","it":"Ortopedico","ru":"Ортопед","uk":"Ортопед","sr":"Ortoped","me":"Ortoped","ar":"طبيب عظام"}'::jsonb, 110),
 ('norolog',          '{"tr":"Nörolog","en":"Neurologist","de":"Neurologe","it":"Neurologo","ru":"Невролог","uk":"Невролог","sr":"Neurolog","me":"Neurolog","ar":"طبيب أعصاب"}'::jsonb, 120),
 ('urolog',           '{"tr":"Ürolog","en":"Urologist","de":"Urologe","it":"Urologo","ru":"Уролог","uk":"Уролог","sr":"Urolog","me":"Urolog","ar":"طبيب مسالك بولية"}'::jsonb, 130),
 ('dahiliye',         '{"tr":"Dahiliye (İç Hastalıkları)","en":"Internal Medicine","de":"Internist","it":"Internista","ru":"Терапевт","uk":"Терапевт","sr":"Internista","me":"Internista","ar":"طبيب باطنية"}'::jsonb, 140),
 ('endokrinolog',     '{"tr":"Endokrinolog","en":"Endocrinologist","de":"Endokrinologe","it":"Endocrinologo","ru":"Эндокринолог","uk":"Ендокринолог","sr":"Endokrinolog","me":"Endokrinolog","ar":"طبيب غدد صماء"}'::jsonb, 150),
 ('gastroenterolog',  '{"tr":"Gastroenterolog","en":"Gastroenterologist","de":"Gastroenterologe","it":"Gastroenterologo","ru":"Гастроэнтеролог","uk":"Гастроентеролог","sr":"Gastroenterolog","me":"Gastroenterolog","ar":"طبيب جهاز هضمي"}'::jsonb, 160),
 ('fizyoterapist',    '{"tr":"Fizyoterapist","en":"Physiotherapist","de":"Physiotherapeut","it":"Fisioterapista","ru":"Физиотерапевт","uk":"Фізіотерапевт","sr":"Fizioterapeut","me":"Fizioterapeut","ar":"أخصائي علاج طبيعي"}'::jsonb, 170),
 ('diyetisyen',       '{"tr":"Diyetisyen","en":"Dietitian","de":"Ernährungsberater","it":"Dietologo","ru":"Диетолог","uk":"Дієтолог","sr":"Nutricionista","me":"Nutricionista","ar":"أخصائي تغذية"}'::jsonb, 180),
 ('genel-cerrah',     '{"tr":"Genel Cerrah","en":"General Surgeon","de":"Allgemeinchirurg","it":"Chirurgo generale","ru":"Хирург","uk":"Хірург","sr":"Hirurg","me":"Hirurg","ar":"جراح عام"}'::jsonb, 190),
 ('radyolog',         '{"tr":"Radyolog","en":"Radiologist","de":"Radiologe","it":"Radiologo","ru":"Рентгенолог","uk":"Радіолог","sr":"Radiolog","me":"Radiolog","ar":"طبيب أشعة"}'::jsonb, 200)
on conflict (slug) do nothing;

-- 2 test provider (approved+published) — deterministik UUID'ler → idempotent.
-- user_id NULL (auth.users gerektirmez); admin/service-role yönetir.
insert into health.clinics (id, owner_user_id, name, vat_number) values
 ('c1000000-0000-4000-8000-000000000001', null, 'Glatko Test Klinika Budva', null),
 ('c2000000-0000-4000-8000-000000000002', null, 'Glatko Test Centar Podgorica', null)
on conflict (id) do nothing;

insert into health.locations (id, clinic_id, label, address, city, lat, lng) values
 ('e1000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000001',
   'Budva Centar','Mediteranska 1','Budva', 42.2911, 18.8401),
 ('e2000000-0000-4000-8000-000000000002','c2000000-0000-4000-8000-000000000002',
   'Podgorica Centar','Bulevar Svetog Petra Cetinjskog 1','Podgorica', 42.4304, 19.2594)
on conflict (id) do nothing;

insert into health.providers
 (id, user_id, provider_type, full_name, title, slug, languages, bio,
  verification_status, verified_at, is_published) values
 ('d1000000-0000-4000-8000-000000000001', null, 'dentist',
   'Dr. Test Stomatolog', 'Dr. med. dent.', 'dr-test-stomatolog-budva',
   array['me','en','sr'],
   '{"me":"Test stomatolog za H2 demonstraciju.","en":"Test dentist for the H2 directory demo.","tr":"H2 dizini demosu için test diş hekimi."}'::jsonb,
   'approved', now(), true),
 ('d2000000-0000-4000-8000-000000000002', null, 'psychologist',
   'Dr. Test Psiholog', 'Spec.', 'dr-test-psiholog-podgorica',
   array['me','en'],
   '{"me":"Test psiholog za H2 demonstraciju.","en":"Test psychologist for the H2 directory demo.","tr":"H2 dizini demosu için test psikolog."}'::jsonb,
   'approved', now(), true)
on conflict (id) do nothing;

insert into health.provider_specialties (provider_id, specialty_id)
select 'd1000000-0000-4000-8000-000000000001', id from health.specialties where slug='dis-hekimi'
on conflict do nothing;
insert into health.provider_specialties (provider_id, specialty_id)
select 'd2000000-0000-4000-8000-000000000002', id from health.specialties where slug='psikolog'
on conflict do nothing;

insert into health.provider_locations (provider_id, location_id) values
 ('d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001'),
 ('d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002')
on conflict do nothing;

insert into health.services (id, provider_id, name, duration_min, price_eur, mode) values
 ('f1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001',
   '{"me":"Stomatološki pregled","en":"Dental check-up","tr":"Diş muayenesi"}'::jsonb, 30, 25.00, 'in_person'),
 ('f2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002',
   '{"me":"Psihološko savjetovanje","en":"Psychological counseling","tr":"Psikolojik danışmanlık"}'::jsonb, 50, 40.00, 'in_person')
on conflict (id) do nothing;

insert into health.provider_settings (provider_id) values
 ('d1000000-0000-4000-8000-000000000001'),
 ('d2000000-0000-4000-8000-000000000002')
on conflict (provider_id) do nothing;

-- Haftalık takvim: Pzt–Cum (weekday 0–4). Provider1 09:00–17:00, Provider2 10:00–18:00.
insert into health.schedules (id, provider_id, location_id, weekday, start_time, end_time) values
 ('a1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',0,'09:00','17:00'),
 ('a1000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',1,'09:00','17:00'),
 ('a1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',2,'09:00','17:00'),
 ('a1000000-0000-4000-8000-000000000004','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',3,'09:00','17:00'),
 ('a1000000-0000-4000-8000-000000000005','d1000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',4,'09:00','17:00'),
 ('a2000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',0,'10:00','18:00'),
 ('a2000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',1,'10:00','18:00'),
 ('a2000000-0000-4000-8000-000000000003','d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',2,'10:00','18:00'),
 ('a2000000-0000-4000-8000-000000000004','d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',3,'10:00','18:00'),
 ('a2000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002',4,'10:00','18:00')
on conflict (id) do nothing;
