/**
 * localeRichText — 9-locale Portable Text body.
 *
 * Each locale field is a `block`-array (Portable Text) with embedded image
 * support. The frontend renderer (`components/sanity/PortableText.tsx`)
 * picks the active locale and falls back to ME → EN → first non-empty when
 * the target language is missing.
 *
 * Embedded block types: image and faqBlock (structured Q&A → FAQPage
 * schema). Add further blocks via objects/<name>.ts + the `of: []` array
 * below.
 */

import { defineType, defineField } from "sanity";

const LOCALES: Array<{ id: string; title: string }> = [
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

const richTextOf = [
  {
    type: "block",
    styles: [
      { title: "Normal", value: "normal" },
      { title: "H2", value: "h2" },
      { title: "H3", value: "h3" },
      { title: "H4", value: "h4" },
      { title: "Quote", value: "blockquote" },
    ],
    lists: [
      { title: "Bullet", value: "bullet" },
      { title: "Numbered", value: "number" },
    ],
    marks: {
      decorators: [
        { title: "Strong", value: "strong" },
        { title: "Emphasis", value: "em" },
      ],
      annotations: [
        {
          name: "link",
          type: "object",
          title: "Link",
          fields: [
            {
              name: "href",
              type: "url",
              title: "URL",
              validation: (Rule: { uri: (opts: { scheme: string[]; allowRelative: boolean }) => unknown }) =>
                Rule.uri({
                  scheme: ["http", "https", "mailto", "tel"],
                  allowRelative: true,
                }),
            },
          ],
        },
      ],
    },
  },
  {
    type: "image",
    options: { hotspot: true },
    fields: [
      {
        name: "alt",
        type: "string",
        title: "Alt text",
        description: "Describe the image for screen readers + SEO",
      },
      {
        name: "caption",
        type: "string",
        title: "Caption",
      },
    ],
  },
  { type: "faqBlock" },
];

export default defineType({
  name: "localeRichText",
  title: "Localized rich text",
  type: "object",
  fieldsets: [
    { name: "primary", title: "Primary", options: { collapsible: false } },
    {
      name: "translations",
      title: "Translations",
      options: { collapsible: true, collapsed: true },
    },
  ],
  fields: LOCALES.map((locale) =>
    defineField({
      name: locale.id,
      title: locale.title,
      type: "array",
      fieldset: locale.id === "me" ? "primary" : "translations",
      of: richTextOf,
    }),
  ),
});
