/**
 * seoMeta — per-article SEO override.
 *
 * Optional in all fields. The frontend renderer falls back to the article's
 * own title/excerpt + cover image when an override is missing, so most
 * posts can leave this object empty.
 */

import { defineType, defineField } from "sanity";

export default defineType({
  name: "seoMeta",
  title: "SEO",
  type: "object",
  options: { collapsible: true, collapsed: true },
  fields: [
    defineField({
      name: "metaTitle",
      title: "Meta title (override)",
      type: "localeString",
      description:
        "Optional — falls back to article title. Aim for 50-60 characters.",
    }),
    defineField({
      name: "metaDescription",
      title: "Meta description (override)",
      type: "localeText",
      description:
        "Optional — falls back to excerpt. Aim for 140-160 characters.",
    }),
    defineField({
      name: "ogImage",
      title: "Open Graph image (override)",
      type: "image",
      options: { hotspot: true },
      description:
        "Optional — falls back to cover image. Recommended 1200×630.",
    }),
  ],
});
