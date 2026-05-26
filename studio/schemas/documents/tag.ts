import { defineType, defineField } from "sanity";
import { HashIcon } from "@sanity/icons";

/**
 * Tag — lightweight cross-cutting label.
 *
 * One tag can attach to many posts; each post can carry many tags.
 * Title kept simple (Latin only); when a tag's URL needs localisation
 * we'll lift to localeString.
 */
export default defineType({
  name: "tag",
  title: "Tag",
  type: "document",
  icon: HashIcon,
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      validation: (Rule) => Rule.required().min(2).max(40),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      options: { source: "title", maxLength: 48 },
      validation: (Rule) => Rule.required(),
    }),
  ],
  preview: {
    select: { title: "title", subtitle: "slug.current" },
    prepare({ title, subtitle }) {
      return {
        title: `#${title || "untitled"}`,
        subtitle: subtitle || "",
      };
    },
  },
});
