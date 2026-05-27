import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { PortableText } from "@/components/sanity/PortableText";
import { getPostBySlug } from "@/lib/sanity/fetch";
import { urlFor } from "@/lib/sanity/image";
import { buildPostAlternates, localizedUrl } from "@/lib/seo";
import {
  generateArticleSchema,
  generateFAQPageSchema,
  jsonLdScriptProps,
} from "@/lib/seo/jsonld";
import { type FAQBlockItem } from "@/components/blog/FAQBlock";

// Dynamic with a short ISR window. The [locale] layout reads the auth
// session (cookies → dynamic), so the whole tree is dynamic regardless;
// declaring `generateStaticParams` here just made Next try to pre-render
// unlisted slugs and 500 with DYNAMIC_SERVER_USAGE.
export const revalidate = 60;

interface Props {
  params: Promise<{ locale: string; slug: string }> | { locale: string; slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) return {};

  const post = await getPostBySlug(slug, locale).catch(() => null);
  if (!post) return { robots: { index: false } };

  const title = post.seo?.metaTitle ?? post.title;
  const description = post.seo?.metaDescription ?? post.excerpt;

  // OG/Twitter image: force WebP explicitly (fm=webp) instead of relying on
  // auto=format. Social crawlers that omit `Accept: image/webp` were served the
  // full-size source PNG (~1.65 MB); forcing WebP keeps it well under 100 KB.
  const ogImageSrc = post.seo?.ogImage?.asset
    ? urlFor(post.seo.ogImage).width(1200).height(630).format("webp").quality(80).url()
    : post.coverImage?.asset
      ? urlFor(post.coverImage).width(1200).height(630).format("webp").quality(80).url()
      : undefined;

  // Per-post hreflang: link only the locales that actually have a version
  // (this post + its translations), each at its own localized slug.
  const alternates = buildPostAlternates(locale, slug, post.translations ?? []);

  return {
    title,
    description,
    alternates,
    openGraph: {
      title,
      description: description ?? undefined,
      url: alternates.canonical,
      siteName: "Glatko",
      type: "article",
      publishedTime: post.publishedAt,
      images: ogImageSrc ? [{ url: ogImageSrc, width: 1200, height: 630 }] : [],
      locale,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description ?? undefined,
      images: ogImageSrc ? [ogImageSrc] : undefined,
    },
    robots: { index: true, follow: true },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { locale, slug } = await Promise.resolve(params);
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const post = await getPostBySlug(slug, locale).catch(() => null);
  if (!post) notFound();

  // Article JSON-LD — emitted for every post (the dominant case). FAQPage is
  // layered in additively when the body contains an FAQ block. The canonical
  // URL comes from localizedUrl() so structured data stays in lockstep with
  // the page canonical / hreflang built by buildAlternates().
  const articleUrl = localizedUrl(locale, "/blog/[slug]", { slug });
  const articleImage = post.seo?.ogImage?.asset
    ? urlFor(post.seo.ogImage).width(1200).height(630).format("webp").quality(80).url()
    : post.coverImage?.asset
      ? urlFor(post.coverImage).width(1200).height(630).format("webp").quality(80).url()
      : undefined;
  const articleSchema = generateArticleSchema({
    title: post.title,
    description: post.excerpt ?? undefined,
    url: articleUrl,
    imageUrl: articleImage,
    authorName: post.author?.name ?? undefined,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt ?? undefined,
    locale,
  });

  // FAQPage JSON-LD — additive: emitted only when the body has FAQ block(s).
  // post.content is already the active-locale array, so the Q/A strings are
  // localized; wrap each per-locale to reuse generateFAQPageSchema's picker.
  const faqItems: FAQBlockItem[] = (
    Array.isArray(post.content) ? post.content : []
  )
    .filter((b) => (b as { _type?: string })._type === "faqBlock")
    .flatMap((b) => (b as { questions?: FAQBlockItem[] }).questions ?? []);
  const faqSchema = generateFAQPageSchema(
    faqItems.map((item) => ({
      q: { [locale]: item.question },
      a: { [locale]: item.answer },
    })),
    locale,
  );

  return (
    <article className="mx-auto max-w-3xl px-4 pb-20 pt-28 sm:px-6 lg:px-8">
      <script {...jsonLdScriptProps(articleSchema)} />
      {faqSchema ? <script {...jsonLdScriptProps(faqSchema)} /> : null}
      <Link
        href="/blog"
        className="text-xs font-medium text-teal-700 hover:underline dark:text-teal-400"
      >
        ← {locale === "tr" ? "Tüm makaleler" : locale === "en" ? "All articles" : "Svi članci"}
      </Link>

      <header className="mt-4 mb-8">
        {post.category ? (
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-teal-700 dark:text-teal-400">
            {post.category.title}
          </div>
        ) : null}
        <h1 className="font-serif text-3xl font-semibold leading-tight text-gray-900 dark:text-white md:text-5xl">
          {post.title}
        </h1>
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-white/60">
          {post.author?.avatar?.asset ? (
            <Image
              src={urlFor(post.author.avatar).width(48).height(48).url()}
              alt={post.author.name ?? ""}
              width={40}
              height={40}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : null}
          {post.author?.name ? (
            <div>
              <div className="font-medium text-gray-900 dark:text-white">
                {post.author.name}
              </div>
              {post.author.role ? (
                <div className="text-xs text-gray-500 dark:text-white/50">
                  {post.author.role}
                </div>
              ) : null}
            </div>
          ) : null}
          <time
            dateTime={post.publishedAt}
            className="ml-auto text-xs text-gray-500 dark:text-white/50"
          >
            {new Date(post.publishedAt).toLocaleDateString(locale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        </div>
      </header>

      {post.coverImage?.asset ? (
        <figure className="mb-10 overflow-hidden rounded-2xl border border-gray-200/60 dark:border-white/[0.08]">
          <Image
            src={urlFor(post.coverImage).width(1456).url()}
            alt={post.coverImage.alt ?? post.title}
            width={1456}
            height={816}
            className="h-auto w-full"
            sizes="(max-width: 768px) 100vw, 768px"
            priority
          />
        </figure>
      ) : null}

      <PortableText value={post.content} />

      {post.tags && post.tags.length > 0 ? (
        <footer className="mt-12 border-t border-gray-200/70 pt-6 dark:border-white/[0.08]">
          <div className="flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag.slug}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-white/[0.06] dark:text-white/70"
              >
                #{tag.title}
              </span>
            ))}
          </div>
        </footer>
      ) : null}
    </article>
  );
}
