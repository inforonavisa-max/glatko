import { describe, expect, it } from "vitest";
import {
  HEALTH_RESCHEDULE_SMS,
  HEALTH_RESCHEDULE_EMAIL_SUBJECT,
  HEALTH_RESCHEDULE_PROVIDER_SMS,
  HEALTH_RESCHEDULE_PROVIDER_EMAIL_SUBJECT,
} from "@/lib/saglik/reminder-templates";
import { locales } from "@/i18n/routing";

/**
 * H9 — reschedule SMS/email templates. Mirror the assertions already used for the
 * H6 templates (reminders-dispatch.test): 9 locales, sr/me Latin (no Cyrillic), ar
 * Arabic, the move slots interpolate, and SMS length stays sane.
 */

const CYRILLIC = /[Ѐ-ӿ]/;
const ARABIC = /[؀-ۿ]/;

describe("HEALTH_RESCHEDULE_SMS (patient move) — 9 locales", () => {
  it("has exactly 9 locale keys", () => {
    expect(Object.keys(HEALTH_RESCHEDULE_SMS).sort()).toEqual([...locales].sort());
  });

  it("interpolates oldDt + newDt + doctor + url for every locale", () => {
    for (const l of locales) {
      const out = HEALTH_RESCHEDULE_SMS[l]("OLD_DT", "NEW_DT", "THE_DOCTOR", "https://glatko.app/x");
      expect(out).toContain("OLD_DT");
      expect(out).toContain("NEW_DT");
      expect(out).toContain("THE_DOCTOR");
      expect(out).toContain("https://glatko.app/x");
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it("sr/me render Latin (no Cyrillic), ar renders Arabic", () => {
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_SMS.sr("o", "n", "dr", "u"))).toBe(false);
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_SMS.me("o", "n", "dr", "u"))).toBe(false);
    expect(ARABIC.test(HEALTH_RESCHEDULE_SMS.ar("o", "n", "dr", "u"))).toBe(true);
  });
});

describe("HEALTH_RESCHEDULE_PROVIDER_SMS (provider move) — 9 locales", () => {
  it("has exactly 9 locale keys", () => {
    expect(Object.keys(HEALTH_RESCHEDULE_PROVIDER_SMS).sort()).toEqual([...locales].sort());
  });

  it("interpolates oldDt + newDt + patient first name; carries no url", () => {
    for (const l of locales) {
      const out = HEALTH_RESCHEDULE_PROVIDER_SMS[l]("OLD_DT", "NEW_DT", "Marko");
      expect(out).toContain("OLD_DT");
      expect(out).toContain("NEW_DT");
      expect(out).toContain("Marko");
      // The provider message must never embed a patient manage_token (no link).
      expect(out).not.toContain("http");
    }
  });

  it("sr/me render Latin (no Cyrillic), ar renders Arabic", () => {
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_PROVIDER_SMS.sr("o", "n", "p"))).toBe(false);
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_PROVIDER_SMS.me("o", "n", "p"))).toBe(false);
    expect(ARABIC.test(HEALTH_RESCHEDULE_PROVIDER_SMS.ar("o", "n", "p"))).toBe(true);
  });
});

describe("reschedule email subjects — 9 locales, non-empty", () => {
  it("patient + provider subjects each have 9 non-empty locale keys", () => {
    for (const map of [HEALTH_RESCHEDULE_EMAIL_SUBJECT, HEALTH_RESCHEDULE_PROVIDER_EMAIL_SUBJECT]) {
      expect(Object.keys(map).sort()).toEqual([...locales].sort());
      for (const l of locales) expect(map[l].trim().length).toBeGreaterThan(0);
    }
  });

  it("patient sr/me subjects are Latin, ar is Arabic", () => {
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_EMAIL_SUBJECT.sr)).toBe(false);
    expect(CYRILLIC.test(HEALTH_RESCHEDULE_EMAIL_SUBJECT.me)).toBe(false);
    expect(ARABIC.test(HEALTH_RESCHEDULE_EMAIL_SUBJECT.ar)).toBe(true);
  });
});
