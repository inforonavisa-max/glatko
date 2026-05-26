/**
 * localeString — 9-locale short text (titles, labels, captions, meta titles).
 *
 * Glatko locales (must match i18n/routing.ts and the URL prefixes):
 *   me  — Crnogorski (sr-Latn-ME) — primary
 *   tr  — Türkçe
 *   en  — English
 *   ru  — Русский
 *   de  — Deutsch
 *   it  — Italiano
 *   sr  — Srpski (sr-Latn-RS)
 *   ar  — العربية
 *   uk  — Українська
 *
 * Migration rule: populate the post's primary locale. Other locales either
 * mirror the primary or remain empty until a translator fills them. The
 * frontend renderer falls back to ME → EN → first available when a target
 * locale is empty.
 *
 * NOTE: Do NOT mark any single locale required here — requiredness lives on
 * the parent field (e.g. post.title) so locale gating works at the document
 * level rather than the primitive.
 */

import { defineType, defineField } from "sanity";

export default defineType({
  name: "localeString",
  title: "Localized string",
  type: "object",
  fieldsets: [
    {
      name: "primary",
      title: "Primary",
      options: { collapsible: false },
    },
    {
      name: "translations",
      title: "Translations",
      options: { collapsible: true, collapsed: false },
    },
  ],
  fields: [
    defineField({
      name: "me",
      title: "Crnogorski (ME)",
      type: "string",
      fieldset: "primary",
    }),
    defineField({
      name: "tr",
      title: "Türkçe",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "en",
      title: "English",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "ru",
      title: "Русский",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "de",
      title: "Deutsch",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "it",
      title: "Italiano",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "sr",
      title: "Srpski",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "ar",
      title: "العربية",
      type: "string",
      fieldset: "translations",
    }),
    defineField({
      name: "uk",
      title: "Українська",
      type: "string",
      fieldset: "translations",
    }),
  ],
});
