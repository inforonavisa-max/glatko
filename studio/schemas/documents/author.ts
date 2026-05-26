import { defineType, defineField } from "sanity";
import { UserIcon } from "@sanity/icons";

/**
 * Author — byline + bio for article attribution.
 *
 * Single Latin slug (no per-locale slugs); the author's URL doesn't need
 * to be localised on day one. Bio is per-locale because the page might
 * surface a non-trivial bio paragraph.
 */
export default defineType({
  name: "author",
  title: "Author",
  type: "document",
  icon: UserIcon,
  fields: [
    defineField({
      name: "name",
      title: "Name",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(80),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "name", maxLength: 64 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "role",
      title: "Role",
      type: "string",
      description: "e.g. \"Founder\", \"Local Pro\"",
    }),
    defineField({
      name: "avatar",
      title: "Avatar",
      type: "image",
      options: { hotspot: true },
    }),
    defineField({
      name: "bio",
      title: "Bio",
      type: "localeText",
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "role",
      media: "avatar",
    },
  },
});
