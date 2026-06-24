import { getRequestConfig } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { routing } from './routing';
import { deepMerge } from './deep-merge';

const FALLBACK_LOCALE = 'en';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  const localeMessages = (await import(`../dictionaries/${locale}.json`))
    .default as Record<string, unknown>;

  // English is the fallback layer: any key absent from the active locale
  // resolves to the English value instead of rendering the raw key to the user
  // (e.g. founding.badge.tooltip, or careerVertical.* before native strings land).
  const messages =
    locale === FALLBACK_LOCALE
      ? localeMessages
      : deepMerge(
          (await import(`../dictionaries/${FALLBACK_LOCALE}.json`))
            .default as Record<string, unknown>,
          localeMessages,
        );

  return {
    locale,
    messages,
  };
});
