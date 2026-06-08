"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { HOME_FAQ_KEYS } from "@/lib/glatko/home-faq";

export function FAQ() {
  const t = useTranslations();
  const reduced = useReducedMotion();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section className="bg-gray-50/50 py-20 dark:bg-white/[0.02] md:py-28">
      <div className="mx-auto max-w-3xl px-4">
        <motion.div
          initial={reduced ? {} : { opacity: 0, y: 20 }}
          whileInView={reduced ? {} : { opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          style={reduced ? undefined : { willChange: "transform, opacity" }}
          className="mb-12 text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white md:text-4xl">
            {t("landing.faq.title")}
          </h2>
        </motion.div>

        <div className="space-y-3">
          {HOME_FAQ_KEYS.map((key, index) => (
            <motion.div
              key={key}
              initial={reduced ? {} : { opacity: 0, y: 10 }}
              whileInView={reduced ? {} : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-30px" }}
              transition={{ duration: 0.4, delay: Math.min(index, 7) * 0.06 }}
              style={reduced ? undefined : { willChange: "transform, opacity" }}
              className="overflow-hidden rounded-xl border border-gray-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-neutral-900"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                aria-expanded={openIndex === index}
                className="flex w-full items-center gap-3 px-6 py-5 text-left"
              >
                <motion.div
                  initial={false}
                  animate={{ rotate: openIndex === index ? 45 : 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="shrink-0"
                >
                  <Plus className="h-5 w-5 text-teal-500" />
                </motion.div>
                <span className="text-sm font-medium text-gray-900 dark:text-white md:text-base">
                  {t(`landing.faq.q${key}`)}
                </span>
              </button>

              {/* Answer stays mounted (height-collapsed when closed) so the
                  text is in the SSR HTML for crawlers — required for FAQPage
                  rich-result eligibility and to match the page's FAQPage
                  JSON-LD (app/[locale]/page.tsx). */}
              <motion.div
                initial={false}
                animate={
                  reduced
                    ? { height: openIndex === index ? "auto" : 0 }
                    : {
                        height: openIndex === index ? "auto" : 0,
                        opacity: openIndex === index ? 1 : 0,
                      }
                }
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 400, damping: 40, mass: 1 }
                }
                className="overflow-hidden px-6"
              >
                <div className="pb-5 pl-8">
                  <p className="text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
                    {t(`landing.faq.a${key}`)}
                  </p>
                </div>
              </motion.div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
