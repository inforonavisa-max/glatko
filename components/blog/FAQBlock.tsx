"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * FAQ accordion rendered for a `faqBlock` embedded in a post body.
 *
 * Strings arrive already localized — the GROQ projection flattens
 * `content.$locale`, so each block is the active locale's content. Answers
 * are shown expanded-on-toggle but always present in the DOM-adjacent text
 * (visible answers are required for FAQ rich-result eligibility); the same
 * Q/A also feeds FAQPage JSON-LD on the page.
 */
export interface FAQBlockItem {
  question: string;
  answer: string;
}

export function FAQBlock({
  heading,
  questions,
}: {
  heading?: string;
  questions: FAQBlockItem[];
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  if (!questions || questions.length === 0) return null;

  return (
    <section className="my-10">
      {heading ? (
        <h2 className="mb-4 font-serif text-2xl font-semibold text-gray-900 dark:text-white">
          {heading}
        </h2>
      ) : null}
      <div className="space-y-2">
        {questions.map((item, i) => {
          const isOpen = openIndex === i;
          return (
            <div
              key={i}
              className="rounded-xl border border-gray-200/70 dark:border-white/[0.08]"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left font-medium text-gray-900 dark:text-white"
              >
                <span>{item.question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={cn(
                    "h-5 w-5 shrink-0 text-gray-500 transition-transform dark:text-white/50",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen ? (
                <p className="whitespace-pre-line px-4 pb-4 leading-relaxed text-gray-700 dark:text-white/70">
                  {item.answer}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
