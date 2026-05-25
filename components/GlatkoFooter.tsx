"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle, Phone } from "lucide-react";

export function GlatkoFooter() {
  const t = useTranslations();
  const whatsappSupport = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT;
  const viberSupport = process.env.NEXT_PUBLIC_VIBER_SUPPORT;

  const columns = [
    {
      title: t("nav.services"),
      links: [
        { label: t("services.title"), href: "/services" },
        { label: t("howItWorks.title"), href: "/how-it-works" },
      ],
    },
    {
      title: t("footer.company"),
      links: [
        { label: t("footer.about"), href: "/about" },
        { label: t("footer.contact"), href: "/contact" },
        { label: t("nav.becomeAPro"), href: "/become-a-pro" },
      ],
    },
    {
      title: t("footer.support"),
      links: [
        { label: t("footer.help"), href: "/contact" },
        { label: t("footer.requestService"), href: "/request-service" },
        ...(whatsappSupport
          ? [{ label: t("legal.whatsappSupport"), href: `https://wa.me/${whatsappSupport}`, external: true, icon: "whatsapp" as const }]
          : []),
        ...(viberSupport
          ? [{ label: t("footer.viberSupport"), href: `viber://chat?number=${encodeURIComponent(viberSupport)}`, external: true, icon: "viber" as const }]
          : []),
      ],
    },
    {
      title: t("footer.legal"),
      links: [
        { label: t("footer.terms"), href: "/terms" },
        { label: t("footer.privacy"), href: "/privacy" },
        { label: t("footer.cookies"), href: "/cookies" },
        { label: t("footer.gdpr"), href: "/gdpr" },
      ],
    },
  ];

  return (
    <footer className="border-t border-gray-200 bg-gray-50 dark:border-white/5 dark:bg-[#0b1f23]">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2 md:col-span-1">
            <div className="mb-4 flex items-center gap-1">
              <span className="text-xl font-bold text-gray-900 dark:text-white">
                Glatko
              </span>
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-teal-500" />
            </div>
            <p className="max-w-xs text-sm text-gray-500 dark:text-white/50">
              {t("brand.description")}
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs font-semibold uppercase tracking-widest text-gray-600 dark:text-gray-300">
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-gray-600 transition-colors hover:text-teal-600 dark:text-white/60 dark:hover:text-teal-400"
                      >
                        {"icon" in link && link.icon === "viber"
                          ? <Phone className="h-3.5 w-3.5 text-[#7360F2]" />
                          : <MessageCircle className="h-3.5 w-3.5 text-[#25D366]" />}
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        // Footer links are statically declared but their concrete type is widened to `string`;
                        // next-intl's Link href expects a pathname union from the routing map.
                        // @ts-expect-error -- string-typed href, runtime URLs match pathnames
                        href={link.href}
                        className="text-sm text-gray-600 transition-colors hover:text-teal-600 dark:text-white/60 dark:hover:text-teal-400"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-gray-200 pt-8 sm:flex-row dark:border-white/5">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("footer.copyright")}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("footer.madeIn")}
          </p>
        </div>
      </div>
    </footer>
  );
}
