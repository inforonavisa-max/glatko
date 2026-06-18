-- ═══════════════════════════════════════════════════════════════════════════
-- 078: C0 seed — sectors (Construction + Hospitality, 9/9 locale) — idempotent
-- ═══════════════════════════════════════════════════════════════════════════
-- 073 (schema) ÜZERİNE data. Mirrors 067_health_h1_seed.sql. RULE R9: without this the
-- /career/sectors hub renders empty. ON CONFLICT(slug) DO UPDATE → re-applicable to prod
-- and self-healing if a locale string is corrected later. Locales: tr/en/de/it/ru/uk/sr/me/ar.
-- Construction first (recommended pilot sector — plan §5 "launch ONE sector first").
-- No worker/employer fixtures are seeded (concierge MVP onboards the first cohort by hand).

insert into career.sectors (slug, name_jsonb, is_published, sort_order) values
 ('construction',
  '{"tr":"İnşaat","en":"Construction","de":"Bauwesen","it":"Edilizia","ru":"Строительство","uk":"Будівництво","sr":"Građevinarstvo","me":"Građevinarstvo","ar":"البناء والتشييد"}'::jsonb,
  true, 10),
 ('hospitality',
  '{"tr":"Turizm ve Otelcilik","en":"Hospitality","de":"Gastgewerbe","it":"Ospitalità","ru":"Гостеприимство","uk":"Готельно-ресторанна справа","sr":"Ugostiteljstvo","me":"Ugostiteljstvo","ar":"الضيافة"}'::jsonb,
  true, 20)
on conflict (slug) do update
  set name_jsonb   = excluded.name_jsonb,
      is_published = excluded.is_published,
      sort_order   = excluded.sort_order;
