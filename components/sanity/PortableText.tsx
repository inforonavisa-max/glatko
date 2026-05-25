"use client";

import {
  PortableText as PortableTextReact,
  type PortableTextComponents,
} from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import Image from "next/image";
import Link from "next/link";

import { urlFor } from "@/lib/sanity/image";
import type { SanityImage } from "@/lib/sanity/types";
import { cn } from "@/lib/utils";
import { FAQBlock, type FAQBlockItem } from "@/components/blog/FAQBlock";

/**
 * Glatko Portable Text renderer.
 *
 * Tailwind v3 explicit colours (memory item 21 — no shadcn v4 tokens).
 * Mobile-friendly defaults; longer-form articles inherit the parent
 * `prose` wrapper that the blog detail page applies.
 */

const components: PortableTextComponents = {
  types: {
    image: ({ value }: { value: SanityImage & { alt?: string; caption?: string } }) => {
      if (!value?.asset) return null;
      const builder = urlFor(value).width(1200);
      return (
        <figure className="my-8">
          <Image
            src={builder.url()}
            alt={value.alt ?? ""}
            width={1200}
            height={675}
            className="h-auto w-full rounded-xl border border-gray-200/60 dark:border-white/[0.08]"
            sizes="(max-width: 768px) 100vw, 768px"
          />
          {value.caption ? (
            <figcaption className="mt-2 text-center text-sm text-gray-500 dark:text-white/50">
              {value.caption}
            </figcaption>
          ) : null}
        </figure>
      );
    },
    faqBlock: ({
      value,
    }: {
      value: { heading?: string; questions?: FAQBlockItem[] };
    }) => {
      if (!value?.questions?.length) return null;
      return <FAQBlock heading={value.heading} questions={value.questions} />;
    },
  },
  block: {
    h2: ({ children }) => (
      <h2 className="mt-10 mb-4 font-serif text-3xl font-semibold text-gray-900 dark:text-white">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-8 mb-3 font-serif text-2xl font-semibold text-gray-900 dark:text-white">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="mt-6 mb-3 text-xl font-semibold text-gray-900 dark:text-white">
        {children}
      </h4>
    ),
    normal: ({ children }) => (
      <p className="my-4 leading-relaxed text-gray-800 dark:text-white/80">
        {children}
      </p>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 border-l-4 border-teal-500 pl-4 italic text-gray-700 dark:text-white/70">
        {children}
      </blockquote>
    ),
  },
  marks: {
    link: ({ children, value }) => {
      const href = (value as { href?: string } | undefined)?.href ?? "#";
      const isExternal = /^https?:\/\//i.test(href);
      return (
        <Link
          href={href}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-teal-700 underline-offset-2 hover:underline dark:text-teal-300"
        >
          {children}
        </Link>
      );
    },
    strong: ({ children }) => (
      <strong className="font-semibold text-gray-900 dark:text-white">
        {children}
      </strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
  },
  list: {
    bullet: ({ children }) => (
      <ul className="my-4 list-disc space-y-2 pl-6 text-gray-800 dark:text-white/80">
        {children}
      </ul>
    ),
    number: ({ children }) => (
      <ol className="my-4 list-decimal space-y-2 pl-6 text-gray-800 dark:text-white/80">
        {children}
      </ol>
    ),
  },
};

interface Props {
  value: PortableTextBlock[] | null | undefined;
  className?: string;
}

export function PortableText({ value, className }: Props) {
  if (!value || value.length === 0) return null;
  return (
    <div className={cn("portable-text", className)}>
      <PortableTextReact value={value} components={components} />
    </div>
  );
}
