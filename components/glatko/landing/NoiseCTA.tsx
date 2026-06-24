"use client";

import type { ComponentProps } from "react";
import { motion } from "framer-motion";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type NoiseCTAProps = {
  title: string;
  subtitle: string;
  buttonText: string;
  // next-intl's localized Href: accepts a string pathname or the object form
  // `{ pathname, query }` so callers can pass a query (e.g. ?redirect=) that
  // still gets locale-prefixed/translated. A bare string with a query baked in
  // bypasses localization, so prefer the object form when there's a query.
  buttonHref: ComponentProps<typeof Link>["href"];
  className?: string;
};

export function NoiseCTA({
  title,
  subtitle,
  buttonText,
  buttonHref,
  className,
}: NoiseCTAProps) {
  return (
    <section
      className={cn(
        "relative z-20 flex flex-col items-center justify-center overflow-hidden px-4 py-16 text-center md:py-24",
        className,
      )}
    >
      <div className="absolute inset-0 -z-10 bg-neutral-950">
        <div
          className="absolute inset-0 bg-[url('/noise.webp')] opacity-[0.06]"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/70 to-black/85"
          aria-hidden
        />
      </div>
      <h2 className="relative z-10 max-w-2xl text-2xl font-bold tracking-tight text-white md:text-4xl">
        {title}
      </h2>
      <p className="relative z-10 mt-4 max-w-lg text-sm text-neutral-300 md:text-base">
        {subtitle}
      </p>
      <div className="relative z-10 mt-10">
        <Link href={buttonHref}>
          <motion.span
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex rounded-xl bg-gradient-to-r from-teal-500 to-teal-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-teal-500/30"
          >
            {buttonText}
          </motion.span>
        </Link>
      </div>
    </section>
  );
}
