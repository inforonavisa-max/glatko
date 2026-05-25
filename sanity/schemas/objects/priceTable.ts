import { defineField, defineType } from "sanity";
import { BillIcon } from "@sanity/icons";

/**
 * priceTable — structured price ranges for cost-guide posts (CONTENT-ENGINE
 * B1–B3). Lives inside localeRichText, so text fields are PLAIN strings in
 * the surrounding locale (same pattern as the image and faqBlock blocks).
 * Prices are numbers plus a shared currency; the frontend formats them.
 */
export default defineType({
  name: "priceTable",
  title: "Price Table",
  type: "object",
  icon: BillIcon,
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      description: 'e.g. "Cleaning prices in Budva (2026)".',
    }),
    defineField({
      name: "currency",
      title: "Currency",
      type: "string",
      initialValue: "EUR",
      options: {
        list: [
          { title: "EUR (€)", value: "EUR" },
          { title: "USD ($)", value: "USD" },
        ],
        layout: "radio",
      },
    }),
    defineField({
      name: "rows",
      title: "Price rows",
      type: "array",
      validation: (Rule) => Rule.min(2).max(50),
      of: [
        {
          type: "object",
          name: "priceRow",
          fields: [
            defineField({
              name: "service",
              title: "Service / item",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "priceLow",
              title: "Price (low)",
              type: "number",
              validation: (Rule) => Rule.required().min(0),
            }),
            defineField({
              name: "priceHigh",
              title: "Price (high)",
              type: "number",
              description: "Leave empty for a single price.",
              validation: (Rule) => Rule.min(0),
            }),
            defineField({
              name: "unit",
              title: "Unit",
              type: "string",
              description: 'e.g. "per hour", "per m²", "per visit".',
            }),
            defineField({
              name: "notes",
              title: "Notes",
              type: "string",
              description: "Optional small note.",
            }),
          ],
          preview: {
            select: { service: "service", low: "priceLow", high: "priceHigh" },
            prepare({ service, low, high }) {
              const price =
                high != null ? `${low}–${high}` : low != null ? `${low}` : "?";
              return { title: service || "(row)", subtitle: price };
            },
          },
        },
      ],
    }),
    defineField({
      name: "caption",
      title: "Caption / disclaimer",
      type: "text",
      rows: 2,
      description:
        'e.g. "Typical ranges from local market data; provider quotes may vary."',
    }),
  ],
  preview: {
    select: { heading: "heading", rows: "rows" },
    prepare({ heading, rows }) {
      const count = Array.isArray(rows) ? rows.length : 0;
      return {
        title: heading || "Price Table",
        subtitle: `${count} row${count === 1 ? "" : "s"}`,
      };
    },
  },
});
