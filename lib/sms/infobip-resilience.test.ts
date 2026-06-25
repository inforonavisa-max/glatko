import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendSms } from "@/lib/sms/infobip";

/**
 * G-NOTIFICATION-RESILIENCE-01 — sendSms timeout + retry classification.
 *
 * The production SocketError ("fetch failed / other side closed") came from a
 * cron's fire-and-forget SMS being killed when the function froze. This file
 * locks the transport-level half of the fix:
 *   • a hung fetch is bounded by an AbortController → clean {ok:false,sms_timeout}
 *   • transient failures (genuine network error / 5xx) are retried with backoff
 *   • timeouts and PERMANENT failures (4xx, rejected, missing id) are NOT retried
 *   • OTP callers pass retries:0 → exactly one attempt (no duplicate codes)
 */

const OLD_ENV = process.env;

/** A minimal Response stand-in: attemptSendSms only touches ok/status/text(). */
function fakeResponse(status: number, jsonBody: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(jsonBody),
  } as unknown as Response;
}

const OK_BODY = {
  messages: [{ messageId: "m-123", status: { name: "PENDING_ENROUTE", groupId: 1 } }],
};

beforeEach(() => {
  process.env = {
    ...OLD_ENV,
    INFOBIP_API_KEY: "test-key",
    INFOBIP_BASE_URL: "test.api.infobip.com",
    INFOBIP_SMS_SENDER: "Glatko",
  };
});

afterEach(() => {
  process.env = OLD_ENV;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("sendSms — success + config", () => {
  it("sends once and returns the messageId on a 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res).toEqual({ ok: true, messageId: "m-123", status: "PENDING_ENROUTE" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns sms_not_configured and never fetches when env is missing", async () => {
    delete process.env.INFOBIP_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res).toEqual({ ok: false, error: "sms_not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendSms — retry classification", () => {
  it("retries ONCE on a genuine network error (default retries=1) then gives up", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res).toEqual({ ok: false, error: "sms_network_error" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // initial + 1 retry
  });

  it("does NOT retry a network error when retries=0 (OTP path)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "otp", retries: 0 });

    expect(res).toEqual({ ok: false, error: "sms_network_error" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry a timeout (AbortError) — avoids duplicate SMS", async () => {
    const abortErr = Object.assign(new Error("aborted"), { name: "AbortError" });
    const fetchMock = vi.fn().mockRejectedValue(abortErr);
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res).toEqual({ ok: false, error: "sms_timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on a 5xx (server-side, safe to retry)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(503, {}));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("sms_http_503");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 4xx (our request is wrong)", async () => {
    const body = { requestError: { serviceException: { text: "Invalid destination" } } };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(400, body));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("Invalid destination");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry an Infobip REJECTED (group 5) — a permanent reject", async () => {
    const body = { messages: [{ status: { name: "REJECTED_NOT_ENOUGH_CREDITS", groupId: 5 } }] };
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, body));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("REJECTED_NOT_ENOUGH_CREDITS");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers: network error on attempt 1, success on the retry", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(fakeResponse(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    const res = await sendSms({ to: "+38260000000", text: "hi" });

    expect(res).toEqual({ ok: true, messageId: "m-123", status: "PENDING_ENROUTE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("sendSms — AbortController is wired", () => {
  it("passes an AbortSignal to fetch (timeout guard active)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, OK_BODY));
    vi.stubGlobal("fetch", fetchMock);

    await sendSms({ to: "+38260000000", text: "hi" });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});
