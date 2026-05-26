import { defineType, defineField } from "sanity";
import { TagIcon } from "@sanity/icons";

/**
 * Category — top-level grouping for blog articles.
 *
 * Distinct from `glatko_service_categories` (the platform's service
 * taxonomy in Supabase). Blog categories are editorial: "Boka Bay
 * insights", "Founder notes", "Service guides" — not service slugs.
 *
 * The article schema separately tracks `serviceCategoryRefs` (string
 * array of Supabase slugs) for cross-linking blog → /services/[slug].
 */
export default defineType({
  name: "category",
  title: "Blog Category",
  type: "document",
  icon: TagIcon,
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
      type: "slug",
      options: {
        source: (doc: unknown) =>
          (doc as { title?: { me?: string } })?.title?.me ?? "",
        maxLength: 64,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "localeText",
    }),
    defineField({
      name: "order",
      title: "Sort order",
      type: "number",
      description: "Lower numbers appear first in category lists.",
      initialValue: 100,
    }),
  ],
  preview: {
    select: {
      title: "title.me",
      subtitle: "slug.current",
    },
    prepare({ title, subtitle }) {
      return {
        title: title || "(missing ME title)",
        subtitle: subtitle ? `/${subtitle}` : "",
      };
    },
  },
  orderings: [
    {
      title: "Sort order",
      name: "orderAsc",
      by: [{ field: "order", direction: "asc" }],
    },
  ],
});
