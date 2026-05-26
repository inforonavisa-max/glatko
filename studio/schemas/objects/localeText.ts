/**
 * localeText — 9-locale multi-line plain text (excerpts, descriptions,
 * callout bodies, FAQ answers, anything that wants a paragraph per locale).
 *
 * Rich content (headings, lists, embedded images) belongs in localeRichText.
 */

import { defineType, defineField } from "sanity";

const ROWS = 3;

export default defineType({
  name: "localeText",
  title: "Localized text",
  type: "object",
  fieldsets: [
    { name: "primary", title: "Primary", options: { collapsible: false } },
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
      type: "text",
      rows: ROWS,
      fieldset: "primary",
    }),
    defineField({
      name: "tr",
      title: "Türkçe",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "en",
      title: "English",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "ru",
      title: "Русский",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "de",
      title: "Deutsch",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "it",
      title: "Italiano",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "sr",
      title: "Srpski",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "ar",
      title: "العربية",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
    defineField({
      name: "uk",
      title: "Українська",
      type: "text",
      rows: ROWS,
      fieldset: "translations",
    }),
  ],
});
