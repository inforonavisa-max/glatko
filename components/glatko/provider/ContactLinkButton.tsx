"use client";

import type { ReactNode } from "react";
import { trackEventWithMeta, type GlatkoContactChannel } from "@/lib/analytics/track";

interface ContactLinkButtonProps {
  href: string; // tel:, https://wa.me/..., viber://..., mailto:
  channel: GlatkoContactChannel;
  providerId: string;
  providerSlug?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Client wrapper around a contact link (WhatsApp / Viber / phone / email)
 * that fires a `customer_contact_clicked` event before the browser navigates.
 *
 * Used to convert server-rendered provider pages' contact CTAs into trackable
 * client islands without rewriting the surrounding page as a client component.
 * G-ADS-3.
 */
export function ContactLinkButton({
  href,
  channel,
  providerId,
  providerSlug,
  className,
  children,
}: ContactLinkButtonProps) {
  const handleClick = () => {
    trackEventWithMeta("customer_contact_clicked", {
      provider_id: providerId,
      provider_slug: providerSlug,
      contact_channel: channel,
    });
    // Navigation continues via default <a href> behavior — we don't
    // preventDefault, so middle-click / Cmd-click also work as expected.
  };

  // Phone (tel:) and email (mailto:) should not open a new tab; messaging
  // apps (whatsapp / viber) typically should so the original tab is kept.
  const isInPageProtocol = channel === "phone" || channel === "email";

  return (
    <a
      href={href}
      onClick={handleClick}
      className={className}
      target={isInPageProtocol ? undefined : "_blank"}
      rel={isInPageProtocol ? undefined : "noopener noreferrer"}
    >
      {children}
    </a>
  );
}
