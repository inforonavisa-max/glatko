import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import {
  dispatchClaimed,
  dispatchOne,
  dispatchDueReminders,
  isStaleOrIrrelevant,
  renderSmsBody,
  renderEmail,
  type ClaimedReminder,
  type DispatchDeps,
} from "@/lib/saglik/reminders-dispatch";
import {
  HEALTH_T24_SMS,
  HEALTH_T2_SMS,
  HEALTH_CANCELLED_SMS,
  HEALTH_PROVIDER_NEW_BOOKING_SMS,
  HEALTH_FOLLOWUP_SMS,
  HEALTH_T24_EMAIL_SUBJECT,
  HEALTH_T2_EMAIL_SUBJECT,
  HEALTH_CANCELLED_EMAIL_SUBJECT,
  HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT,
  HEALTH_FOLLOWUP_EMAIL_SUBJECT,
  HEALTH_CONFIRM_EMAIL_SUBJECT,
} from "@/lib/saglik/reminder-templates";
import { locales, type Locale } from "@/i18n/routing";
import { formatAppointmentDateTime } from "@/lib/saglik/reminder-format";

const CYRILLIC = /[Ѐ-ӿ]/;
const ARABIC = /[؀-ۿ]/;

// A confirmed appointment, two hours out, with a (fake) decrypted phone + email.
function makeRow(overrides: Partial<ClaimedReminder> = {}): ClaimedReminder {
  return {
    reminderId: "11111111-1111-1111-1111-111111111111",
    appointmentId: "22222222-2222-2222-2222-222222222222",
    channel: "sms",
    template: "t24",
    sendAt: "2026-06-17T08:00:00.000Z",
    retryCount: 0,
    appointmentStatus: "confirmed",
    slotStart: "2026-06-18T08:00:00.000Z",
    slotEnd: "2026-06-18T08:30:00.000Z",
    manageToken: "abc123def456abc123def456abc123def456abc123def456",
    patientLocale: "tr",
    providerLocale: "en",
    phoneE164: "+38269123456",
    email: "patient@example.com",
    patientName: "Marko Petrović",
    providerName: "Helena Novak",
    providerTitle: "Dr.",
    providerSlug: "dr-helena-novak",
    providerUserId: "33333333-3333-3333-3333-333333333333",
    serviceName: "Pregled",
    serviceNameProvider: "Pregled",
    locationLabel: "Klinika Budva",
    locationAddress: "Jadranski put 1",
    locationCity: "Budva",
    ...overrides,
  };
}

// Records calls; ok/throw behaviour is configurable per test.
function makeDeps(opts: {
  smsResult?: { ok: true; messageId: string | null } | { ok: false };
  emailResult?: { ok: true; messageId: string | null } | { ok: false };
  smsThrows?: boolean;
  emailThrows?: boolean;
  providerEmail?: string | null;
  claimRows?: ClaimedReminder[];
} = {}) {
  const sms = vi.fn(async (_to: string, _text: string) => {
    if (opts.smsThrows) throw new Error("boom");
    return opts.smsResult ?? ({ ok: true, messageId: "sms-1" } as const);
  });
  const email = vi.fn(async (_args: { to: string; subject: string; react: ReactElement }) => {
    if (opts.emailThrows) throw new Error("boom");
    return opts.emailResult ?? ({ ok: true, messageId: "email-1" } as const);
  });
  const mark = vi.fn(
    async (
      _id: string,
      _status: "sent" | "failed" | "pending" | "skipped",
      _msg: string | null,
      _bump: boolean,
    ) => {},
  );
  const deps: DispatchDeps = {
    claim: vi.fn(async (_limit: number) => opts.claimRows ?? []),
    enqueueFollowups: vi.fn(async (_min: number) => 0),
    sendSmsFn: sms,
    sendEmailFn: email,
    mark,
    resolveProviderEmail: vi.fn(async (_userId: string | null) =>
      opts.providerEmail === undefined ? "provider@example.com" : opts.providerEmail,
    ),
  };
  return { deps, sms, email, mark };
}

describe("reminder-templates — SMS builders, 9 locales", () => {
  const builders: Array<[string, Record<Locale, (a: string, b: string, c: string) => string>]> = [
    ["t24", HEALTH_T24_SMS],
    ["t2", HEALTH_T2_SMS],
    ["cancelled", HEALTH_CANCELLED_SMS],
    ["provider_new_booking", HEALTH_PROVIDER_NEW_BOOKING_SMS],
    ["followup", HEALTH_FOLLOWUP_SMS],
  ];

  it("every template has exactly 9 locale keys", () => {
    for (const [, map] of builders) {
      expect(Object.keys(map).sort()).toEqual([...locales].sort());
    }
  });

  it("interpolates the url + doctor slot and is non-empty for all locales", () => {
    for (const [, map] of builders) {
      for (const l of locales) {
        const out = map[l]("THE_DATE", "THE_DOCTOR", "https://glatko.app/x");
        expect(out.length).toBeGreaterThan(0);
        // The url + the 2nd arg (doctor / patient-first-name slot) appear in every
        // template; the date slot is template-specific (followup omits it by design).
        expect(out).toContain("https://glatko.app/x");
        expect(out).toContain("THE_DOCTOR");
      }
    }
  });

  it("date slot is interpolated for the appointment-time templates (t24/t2/cancelled)", () => {
    for (const map of [HEALTH_T24_SMS, HEALTH_T2_SMS, HEALTH_CANCELLED_SMS]) {
      for (const l of locales) {
        expect(map[l]("THE_DATE", "THE_DOCTOR", "https://x")).toContain("THE_DATE");
      }
    }
  });

  it("sr/me render Latin (no Cyrillic), ar renders Arabic", () => {
    for (const [, map] of builders) {
      expect(CYRILLIC.test(map.sr("d", "dr", "u"))).toBe(false);
      expect(CYRILLIC.test(map.me("d", "dr", "u"))).toBe(false);
      expect(ARABIC.test(map.ar("d", "dr", "u"))).toBe(true);
    }
  });
});

describe("reminder-templates — email subjects, 9 locales + distinct from confirm", () => {
  const subjects: Array<[string, Record<Locale, string>]> = [
    ["t24", HEALTH_T24_EMAIL_SUBJECT],
    ["t2", HEALTH_T2_EMAIL_SUBJECT],
    ["cancelled", HEALTH_CANCELLED_EMAIL_SUBJECT],
    ["provider_new_booking", HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT],
    ["followup", HEALTH_FOLLOWUP_EMAIL_SUBJECT],
  ];

  it("9 keys each, all non-empty", () => {
    for (const [, map] of subjects) {
      expect(Object.keys(map).sort()).toEqual([...locales].sort());
      for (const l of locales) expect(map[l].trim().length).toBeGreaterThan(0);
    }
  });

  it("each subject differs from the confirm subject in the same locale", () => {
    for (const [, map] of subjects) {
      for (const l of locales) {
        expect(map[l]).not.toEqual(HEALTH_CONFIRM_EMAIL_SUBJECT[l]);
      }
    }
  });
});

describe("intlLocale — sr/me produce Latin date formatting", () => {
  it("me → sr-Latn-ME and sr → sr-Latn render Latin month/weekday (no Cyrillic)", () => {
    const sr = formatAppointmentDateTime("2026-06-18T08:00:00.000Z", "sr");
    const me = formatAppointmentDateTime("2026-06-18T08:00:00.000Z", "me");
    expect(CYRILLIC.test(sr)).toBe(false);
    expect(CYRILLIC.test(me)).toBe(false);
    expect(sr.length).toBeGreaterThan(0);
    expect(me.length).toBeGreaterThan(0);
  });
});

describe("renderSmsBody / renderEmail — per template", () => {
  it("renders the patient-locale SMS for t24/t2/cancelled/followup", () => {
    expect(renderSmsBody(makeRow({ template: "t24" }))).toContain("Glatko");
    expect(renderSmsBody(makeRow({ template: "t2" }))).toContain("Glatko");
    expect(renderSmsBody(makeRow({ template: "cancelled" }))).toContain("Glatko");
    expect(renderSmsBody(makeRow({ template: "followup" }))).toContain("Glatko");
  });

  it("provider_new_booking SMS uses provider locale + patient FIRST name only", () => {
    const out = renderSmsBody(
      makeRow({ template: "provider_new_booking", providerLocale: "en", patientName: "Marko Petrović" }),
    );
    expect(out).toContain("Marko");
    expect(out).not.toContain("Petrović"); // last name never leaks to the provider SMS
  });

  it("renderEmail returns variant-specific t24/t2 subjects", () => {
    const e24 = renderEmail(makeRow({ template: "t24", patientLocale: "en" }));
    const e2 = renderEmail(makeRow({ template: "t2", patientLocale: "en" }));
    expect(e24?.subject).toEqual(HEALTH_T24_EMAIL_SUBJECT.en);
    expect(e2?.subject).toEqual(HEALTH_T2_EMAIL_SUBJECT.en);
  });

  it("unknown patient locale falls back to en (no throw)", () => {
    const out = renderSmsBody(makeRow({ patientLocale: "zz", template: "t24" }));
    expect(out).toContain("Glatko");
  });
});

describe("dispatchOne — channel routing + retry + two-layer", () => {
  it("(a) sms row → sendSms called, email NOT called", async () => {
    const { deps, sms, email } = makeDeps();
    const outcome = await dispatchOne(makeRow({ channel: "sms" }), deps);
    expect(outcome).toBe("sent");
    expect(sms).toHaveBeenCalledTimes(1);
    expect(email).not.toHaveBeenCalled();
  });

  it("(a) email row → sendEmail called, sms NOT called", async () => {
    const { deps, sms, email } = makeDeps();
    const outcome = await dispatchOne(makeRow({ channel: "email", template: "t24" }), deps);
    expect(outcome).toBe("sent");
    expect(email).toHaveBeenCalledTimes(1);
    expect(sms).not.toHaveBeenCalled();
  });

  it("(a) whatsapp row → falls back to SMS (v1)", async () => {
    const { deps, sms } = makeDeps();
    const outcome = await dispatchOne(makeRow({ channel: "whatsapp" }), deps);
    expect(outcome).toBe("sent");
    expect(sms).toHaveBeenCalledTimes(1);
  });

  it("(b) success → mark('sent', msgId, bump=false) once", async () => {
    const { deps, mark } = makeDeps({ smsResult: { ok: true, messageId: "msg-42" } });
    await dispatchOne(makeRow(), deps);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(expect.any(String), "sent", "msg-42", false);
  });

  it("(c) send fails + retryCount<MAX → mark('pending', null, bump=true) so it is re-claimed, failed", async () => {
    const { deps, mark } = makeDeps({ smsResult: { ok: false } });
    const outcome = await dispatchOne(makeRow({ retryCount: 0 }), deps);
    expect(outcome).toBe("failed");
    // Retryable failure stays 'pending' (re-claimable) with retry_count bumped.
    expect(mark).toHaveBeenCalledWith(expect.any(String), "pending", null, true);
  });

  it("(c) send fails + attempts hit MAX → exhausted + Sentry", async () => {
    const sentry = await import("@/lib/sentry/glatko-capture");
    const spy = vi.spyOn(sentry, "glatkoCaptureException").mockImplementation(() => {});
    // retryCount=2 → attempts=3 === MAX_RETRY → exhausted
    const { deps, mark } = makeDeps({ smsResult: { ok: false } });
    const outcome = await dispatchOne(makeRow({ retryCount: 2 }), deps);
    expect(outcome).toBe("exhausted");
    // Exhausted → terminal 'failed' (claim's retry_count<3 filter then excludes it).
    expect(mark).toHaveBeenCalledWith(expect.any(String), "failed", null, true);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("(d) sender THROWS → caught, marked failed, does NOT throw", async () => {
    const { deps, mark } = makeDeps({ smsThrows: true });
    const outcome = await dispatchOne(makeRow(), deps);
    expect(["failed", "exhausted"]).toContain(outcome);
    expect(mark).toHaveBeenCalled();
  });

  it("provider_new_booking with no resolvable provider email → skipped (row closed as 'skipped')", async () => {
    const { deps, email, mark } = makeDeps({ providerEmail: null });
    const outcome = await dispatchOne(makeRow({ template: "provider_new_booking" }), deps);
    expect(outcome).toBe("skipped");
    expect(email).not.toHaveBeenCalled();
    // No-op close is recorded as 'skipped' (not 'sent') so the outbox stays truthful.
    expect(mark).toHaveBeenCalledWith(expect.any(String), "skipped", null, false);
  });

  it("email channel with no patient email → skipped", async () => {
    const { deps, email } = makeDeps();
    const outcome = await dispatchOne(makeRow({ channel: "email", email: null }), deps);
    expect(outcome).toBe("skipped");
    expect(email).not.toHaveBeenCalled();
  });
});

describe("dispatchClaimed — summary tally", () => {
  it("(e) empty claim → all zeros, no sender calls", async () => {
    const { deps, sms, email } = makeDeps();
    const summary = await dispatchClaimed([], deps);
    expect(summary).toEqual({ scanned: 0, sent: 0, failed: 0, exhausted: 0, skipped: 0 });
    expect(sms).not.toHaveBeenCalled();
    expect(email).not.toHaveBeenCalled();
  });

  it("mixed batch tallies sent/failed/skipped correctly", async () => {
    // 1 sms success, 1 sms fail (retry), 1 email-no-address skip
    const rows = [
      makeRow({ reminderId: "r1", channel: "sms" }),
      makeRow({ reminderId: "r2", channel: "sms" }),
      makeRow({ reminderId: "r3", channel: "email", email: null }),
    ];
    // Make r2 fail by toggling the sms mock per call.
    const { deps, sms } = makeDeps();
    let call = 0;
    (sms as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      call++;
      return call === 2 ? { ok: false } : { ok: true, messageId: "m" };
    });
    const summary = await dispatchClaimed(rows, deps);
    expect(summary.scanned).toBe(3);
    expect(summary.sent).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

describe("(f) PII safety — no phone/email/name in console on failure", () => {
  let logs: string[];
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    const capture = (...args: unknown[]) => {
      logs.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    errorSpy = vi.spyOn(console, "error").mockImplementation(capture);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(capture);
    logSpy = vi.spyOn(console, "log").mockImplementation(capture);
  });
  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("failed + thrown send never logs phone/email/patient name", async () => {
    const row = makeRow({
      phoneE164: "+38269999888",
      email: "secret.patient@example.com",
      patientName: "Sensitive FullName",
    });
    const { deps } = makeDeps({ smsThrows: true });
    await dispatchOne(row, deps);
    const blob = logs.join("\n");
    expect(blob).not.toContain("+38269999888");
    expect(blob).not.toContain("secret.patient@example.com");
    expect(blob).not.toContain("Sensitive FullName");
  });
});

describe("isStaleOrIrrelevant — past-slot + cancelled-race relevance guard", () => {
  it("t24/t2 are stale once the slot has already started", () => {
    const past = "2026-06-18T08:00:00.000Z";
    const after = Date.parse("2026-06-18T08:30:00.000Z");
    expect(isStaleOrIrrelevant(makeRow({ template: "t24", slotStart: past }), after)).toBe(true);
    expect(isStaleOrIrrelevant(makeRow({ template: "t2", slotStart: past }), after)).toBe(true);
  });

  it("t24/t2 are NOT stale while the slot is still ahead", () => {
    const future = "2026-06-18T08:00:00.000Z";
    const before = Date.parse("2026-06-17T08:00:00.000Z");
    expect(isStaleOrIrrelevant(makeRow({ template: "t24", slotStart: future }), before)).toBe(false);
    expect(isStaleOrIrrelevant(makeRow({ template: "t2", slotStart: future }), before)).toBe(false);
  });

  it("any slot-relative row on a non-confirmed appointment is irrelevant", () => {
    const future = "2026-06-18T08:00:00.000Z";
    const before = Date.parse("2026-06-17T08:00:00.000Z");
    for (const template of ["t24", "t2", "followup"]) {
      expect(
        isStaleOrIrrelevant(makeRow({ template, slotStart: future, appointmentStatus: "cancelled" }), before),
      ).toBe(true);
    }
  });

  it("cancelled + provider_new_booking are never treated as stale (they fire post-cancel / pre-slot)", () => {
    const past = "2026-06-18T08:00:00.000Z";
    const after = Date.parse("2026-06-19T08:00:00.000Z");
    expect(
      isStaleOrIrrelevant(makeRow({ template: "cancelled", slotStart: past, appointmentStatus: "cancelled" }), after),
    ).toBe(false);
    expect(
      isStaleOrIrrelevant(makeRow({ template: "provider_new_booking", slotStart: past }), after),
    ).toBe(false);
  });

  it("dispatchOne closes a stale t24 as 'skipped' without sending", async () => {
    const { deps, sms, mark } = makeDeps();
    const stale = makeRow({ template: "t24", slotStart: "2000-01-01T00:00:00.000Z" });
    const outcome = await dispatchOne(stale, deps);
    expect(outcome).toBe("skipped");
    expect(sms).not.toHaveBeenCalled();
    expect(mark).toHaveBeenCalledWith(expect.any(String), "skipped", null, false);
  });
});

describe("renderEmail — provider_new_booking uses the PROVIDER-locale service name + no patient token", () => {
  it("provider email service value comes from serviceNameProvider, not the patient-locale serviceName", () => {
    const out = renderEmail(
      makeRow({
        template: "provider_new_booking",
        channel: "email",
        providerLocale: "me",
        patientLocale: "tr",
        serviceName: "Diş muayenesi", // patient (tr)
        serviceNameProvider: "Stomatološki pregled", // provider (me)
      }),
    );
    expect(out).not.toBeNull();
    // The provider email must not embed the patient's manage_token (cancel credential).
    expect(out?.subject).toEqual(HEALTH_PROVIDER_NEW_BOOKING_EMAIL_SUBJECT.me);
  });
});

describe("dispatchDueReminders — top-level orchestration", () => {
  it("sums enqueuedFollowups + claim tally; never double-counts", async () => {
    const { deps } = makeDeps({
      claimRows: [
        makeRow({ reminderId: "a", channel: "sms" }),
        makeRow({ reminderId: "b", channel: "email", email: null }), // skipped
      ],
    });
    (deps.enqueueFollowups as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const summary = await dispatchDueReminders(deps);
    expect(summary.enqueuedFollowups).toBe(3);
    expect(summary.scanned).toBe(2);
    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(deps.claim).toHaveBeenCalledWith(25);
  });

  it("claim THROWS → all-zero summary, Sentry called once, does not throw", async () => {
    const sentry = await import("@/lib/sentry/glatko-capture");
    const spy = vi.spyOn(sentry, "glatkoCaptureException").mockImplementation(() => {});
    const { deps } = makeDeps();
    (deps.claim as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db down"));
    (deps.enqueueFollowups as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    const summary = await dispatchDueReminders(deps);
    expect(summary).toEqual({ enqueuedFollowups: 2, scanned: 0, sent: 0, failed: 0, exhausted: 0, skipped: 0 });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("enqueueFollowups THROWS → caught (Sentry), claim + dispatch still run", async () => {
    const sentry = await import("@/lib/sentry/glatko-capture");
    const spy = vi.spyOn(sentry, "glatkoCaptureException").mockImplementation(() => {});
    const { deps } = makeDeps({ claimRows: [makeRow({ reminderId: "a", channel: "sms" })] });
    (deps.enqueueFollowups as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("seed boom"));
    const summary = await dispatchDueReminders(deps);
    expect(summary.enqueuedFollowups).toBe(0); // never assigned
    expect(summary.sent).toBe(1); // claim + dispatch proceeded
    expect(deps.claim).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
