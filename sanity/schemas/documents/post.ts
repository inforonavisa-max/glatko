import { defineType, defineField } from "sanity";
import { DocumentTextIcon } from "@sanity/icons";

/**
 * Post — Glatko blog article.
 *
 * 9-locale title/slug/excerpt/content. ME is the primary locale; other
 * languages are optional and the frontend reader falls back to ME → EN
 * → first non-empty.
 *
 * `serviceCategoryRefs` is a freeform array of Supabase service-category
 * slugs (e.g. "painter", "boat-services"). Used by /[locale]/services/[slug]
 * to surface relevant articles inline. Stays as plain strings rather than
 * a Sanity reference because the source of truth is the Supabase table.
 */
export default defineType({
  name: "post",
  title: "Article",
  type: "document",
  icon: DocumentTextIcon,
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "localeString",
      validation: (Rule) =>
        Rule.required().custom((value: { me?: string } | undefined) => {
          if (!value?.me) return "Crnogorski (ME) title is required";
          return true;
        }),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "localeSlug",
      validation: (Rule) =>
        Rule.required().custom(
          (value: { me?: { current?: string } } | undefined) => {
            if (!value?.me?.current) return "Crnogorski (ME) slug is required";
            return true;
          },
        ),
    }),
    defineField({
      name: "excerpt",
      title: "Excerpt",
      type: "localeText",
      description: "Used in listing cards and SEO meta description fallback.",
      validation: (Rule) =>
        Rule.required().custom((value: { me?: string } | undefined) => {
          if (!value?.me) return "Crnogorski (ME) excerpt is required";
          return true;
        }),
    }),
    defineField({
      name: "content",
      title: "Content",
      type: "localeRichText",
      validation: (Rule) =>
        Rule.required().custom(
          (value: { me?: unknown[] } | undefined) => {
            const me = value?.me;
            if (!me || (Array.isArray(me) && me.length === 0)) {
              return "Crnogorski (ME) content is required";
            }
            return true;
          },
        ),
    }),
    defineField({
      name: "coverImage",
      title: "Cover image",
      type: "image",
      options: { hotspot: true },
      validation: (Rule) => Rule.required(),
      fields: [
        defineField({
          name: "alt",
          title: "Alt text",
          type: "string",
        }),
      ],
    }),
    defineField({
      name: "author",
      title: "Author",
      type: "reference",
      to: [{ type: "author" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "category",
      title: "Blog category",
      type: "reference",
      to: [{ type: "category" }],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      of: [{ type: "reference", to: [{ type: "tag" }] }],
      validation: (Rule) => Rule.unique(),
    }),
    defineField({
      name: "serviceCategoryRefs",
      title: "Related service categories (Glatko slugs)",
      type: "array",
      of: [{ type: "string" }],
      description:
        "Supabase glatko_service_categories.slug values (e.g. \"painter\", " +
        "\"boat-services\"). Powers blog → /services/[slug] cross-linking.",
      options: { layout: "tags" },
    }),
    defineField({
      name: "publishedAt",
      title: "Published at",
      type: "datetime",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "featured",
      title: "Featured",
      type: "boolean",
      description: "Surface on the blog index hero strip.",
      initialValue: false,
    }),
    defineField({
      name: "seo",
      title: "SEO overrides",
      type: "seoMeta",
    }),
    defineField({
      name: "schemaType",
      title: "Schema.org type",
      type: "string",
      description:
        "JSON-LD structured-data type emitted on the article page. " +
        "Article suits most posts; HowTo for step-by-step guides; FAQPage " +
        "when the post is Q&A-led; ItemList for ranked lists; Service for " +
        "service-focused pages. (FAQPage schema is also emitted automatically " +
        "whenever the body contains an FAQ block, regardless of this setting.)",
      options: {
        list: [
          { title: "Article (default)", value: "article" },
          { title: "How-To", value: "howto" },
          { title: "FAQ Page", value: "faq" },
          { title: "Item List", value: "itemlist" },
          { title: "Service", value: "service" },
        ],
        layout: "dropdown",
      },
      initialValue: "article",
    }),
  ],
  preview: {
    select: {
      title: "title.me",
      authorName: "author.name",
      media: "coverImage",
      featured: "featured",
    },
    prepare({ title, authorName, media, featured }) {
      return {
        title: title || "(missing ME title)",
        subtitle: [featured ? "★" : null, authorName ? `by ${authorName}` : null]
          .filter(Boolean)
          .join("  "),
        media,
      };
    },
  },
  orderings: [
    {
      title: "Published (newest)",
      name: "publishedDesc",
      by: [{ field: "publishedAt", direction: "desc" }],
    },
    {
      title: "Published (oldest)",
      name: "publishedAsc",
      by: [{ field: "publishedAt", direction: "asc" }],
    },
  ],
});
