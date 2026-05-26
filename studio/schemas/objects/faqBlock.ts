import { defineField, defineType } from "sanity";
import { HelpCircleIcon } from "@sanity/icons";

/**
 * faqBlock — structured Q&A embedded in a post body.
 *
 * Lives inside localeRichText, so each instance already sits within ONE
 * locale's content array (content.me, content.en, …). Fields are therefore
 * PLAIN strings, not locale objects — the same pattern the image block uses
 * for its alt/caption. The blog page renders it visibly AND feeds FAQPage
 * JSON-LD; Google requires the answer text to be visible on the page for
 * FAQ rich-result eligibility.
 */
export default defineType({
  name: "faqBlock",
  title: "FAQ Block",
  type: "object",
  icon: HelpCircleIcon,
  fields: [
    defineField({
      name: "heading",
      title: "Heading",
      type: "string",
      description:
        'Optional section heading (e.g. "Frequently asked questions").',
    }),
    defineField({
      name: "questions",
      title: "Questions",
      type: "array",
      validation: (Rule) => Rule.min(2).max(20),
      of: [
        {
          type: "object",
          name: "faqItem",
          fields: [
            defineField({
              name: "question",
              title: "Question",
              type: "string",
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: "answer",
              title: "Answer",
              type: "text",
              rows: 4,
              validation: (Rule) => Rule.required(),
              description: "Plain-text answer (1–3 short paragraphs).",
            }),
          ],
          preview: {
            select: { title: "question", subtitle: "answer" },
          },
        },
      ],
    }),
  ],
  preview: {
    select: { questions: "questions", heading: "heading" },
    prepare({ questions, heading }) {
      const count = Array.isArray(questions) ? questions.length : 0;
      return {
        title: heading || "FAQ Block",
        subtitle: `${count} question${count === 1 ? "" : "s"}`,
      };
    },
  },
});
