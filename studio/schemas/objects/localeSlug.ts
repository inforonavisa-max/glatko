/**
 * localeSlug — 9-locale URL slug.
 *
 * Each locale has its own slug field; the frontend reads
 * `slug.<locale>.current` for the active route. Source callbacks read the
 * enclosing document's `title.<locale>` so the "Generate" button works
 * straight from the editor.
 *
 * Arabic stays plain (no native/latin hybrid like RoNa) for now — Glatko's
 * Arabic blog audience is small enough that latin transliteration gives
 * decent URLs. If/when Arabic SEO matters, lift RoNa's hybrid pattern.
 */

import { defineType, defineField } from "sanity";

interface LocaleTitle {
  title?: {
    me?: string;
    tr?: string;
    en?: string;
    ru?: string;
    de?: string;
    it?: string;
    sr?: string;
    ar?: string;
    uk?: string;
  };
}

const sourceFor = (locale: keyof NonNullable<LocaleTitle["title"]>) =>
  (doc: unknown) => (doc as LocaleTitle)?.title?.[locale] ?? "";

const LOCALES: Array<{
  id: keyof NonNullable<LocaleTitle["title"]>;
  title: string;
}> = [
  { id: "me", title: "Crnogorski (ME)" },
  { id: "tr", title: "Türkçe" },
  { id: "en", title: "English" },
  { id: "ru", title: "Русский" },
  { id: "de", title: "Deutsch" },
  { id: "it", title: "Italiano" },
  { id: "sr", title: "Srpski" },
  { id: "ar", title: "العربية" },
  { id: "uk", title: "Українська" },
];

export default defineType({
  name: "localeSlug",
  title: "Localized slug",
  type: "object",
  fieldsets: [
    { name: "primary", title: "Primary", options: { collapsible: false } },
    {
      name: "translations",
      title: "Translations",
      options: { collapsible: true, collapsed: false },
    },
  ],
  fields: LOCALES.map((locale) =>
    defineField({
      name: locale.id,
      title: locale.title,
      type: "slug",
      fieldset: locale.id === "me" ? "primary" : "translations",
      options: {
        source: sourceFor(locale.id),
        maxLength: 96,
      },
    }),
  ),
});
